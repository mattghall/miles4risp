var https = require('https');
var httpOptions;

const VERSION = "v1.0";
const SCHEDULE_URL = "/api/v1/schedule?lang=en&sportId=1&season=2022&teamId=136&startDate=2022-04-06&endDate=2022-10-10";
const HOST = "statsapi.mlb.com";
var url = "https://" + HOST + SCHEDULE_URL;

var seasonTotals = new Map();
var schedule = new Map();

exports.handler = async function(event, context, callback) {
  console.log("first");
  await downloadSchedule(event, callback);
  console.log("second");
  await processMethod(event, callback);
  console.log("third");
};

function processMethod(event, callback) {
  var method = event.method;
  return new Promise(resolve => {
     if (method == "process") {
      var date = event.date;
      console.log("Processing games for " + date);
      getDataForDate(date, callback);
    } else if (method == "backfill") {
      console.log("Backfilling missing data");
    }
  });
}

async function downloadSchedule(event, callback) {
  if (schedule.size > 0) {
    console.log("Schedule already downloaded");
  } else {
    return new Promise(resolve => {
      scheduleHttpOptions();
      console.log('Getting schedule — start request to ' + url);
      var result = '';

      https.get(httpOptions, (response) => {
        console.log("resp: " + response.statusCode);

        response.on('data', function(responseData) {
          result += responseData;
        });
        response.on('error', function(responseData) {
          result += "error";
          console.log("error: " + responseData);
        });

        response.on('end', function() {
          if (result != 'error') {
            schedule = new Map();
            JSON.parse(result).dates.forEach(object => {
              schedule.set(object.date, object);
            });
            console.log("Schedule set");
            resolve();
          } else {
            console.log("error");
            return;
          }
        });
      });
    });
  }
}

async function getBoxScore(gamePk) {
  if (seasonTotals.has(gamePk)) {
    console.log("Game " + gamePk + " already processed");
    return printTweet(seasonTotals.get(gamePk));
  } else {
    console.log("Getting Box Score Data for " + gamePk);
    boxHttpOptions(gamePk);
    console.log('start request to ' + url);
    var result = '';

    await https.get(httpOptions, (response) => {
      console.log("resp: " + response.statusCode);
      response.on('data', function(responseData) {
        result += responseData;
      });
      response.on('error', function(responseData) {
        result += "error";
        console.log("error: " + responseData);
      });

      response.on('end', function() {
        if (result != 'error') {
          return processBox(JSON.parse(result));
        } else {
          console.log("error");
          return;
        }
      });
    });
  }
}


async function getDataForDate(date, callback) {
  if (!schedule.has(date)) {
    console.log("No games played on " + date);
  } else {
    var gamePks = [];
    var data = schedule.get(date).games;
    for (var game of data) {
      gamePks.push(game.gamePk);
    }
    console.log("Processing games " + gamePks);
    var i = 0;
    var boxScores = [];
    for (var gamePk of gamePks) {
      var msSleep = i * 250;
      if (i > 0) {
        console.log("waiting " + msSleep + "ms to process " + gamePk);
      }
      await setTimeout(() => {
        boxScores.push(getBoxScore(gamePk, callback));
      }, msSleep);
      i++;
    }
    return boxScores;
  }
}

async function processBox(boxScore, callback) {
  console.log("Processing Box " + boxScore.gameData.game.pk);
  var loc = "home";
  var vsAt = "vs";
  var opponent = boxScore.gameData.teams.away.abbreviation;
  if (opponent == "SEA") {
    opponent = boxScore.gameData.teams.home.abbreviation;
    vsAt = "at";
    loc = "away";
  }
  var gameDateTime = new Date(boxScore.gameData.datetime.dateTime);
  var date = (gameDateTime.getMonth() + 1) + "/" + gameDateTime.getDate();

  if (boxScore.gameData.status.detailedState != "Final") {
    if (boxScore.gameData.status.detailedState == "Scheduled") {
      console.log("Game has not started");
      return "Game has not started";
    } else {
      console.log("Game has not ended");
      return "Game has not ended";
    }
  } else {
    console.log("processing completed game");
    var info = boxScore.liveData.boxscore.teams[loc].info[0].fieldList;
    info = info.reduce(function(map, obj) {
      map[obj.label] = obj;
      return map;
    }, {});
    var rispRaw = "Runners left in scoring position, 2 out";
    var runners = [];
    if (info.hasOwnProperty("Runners left in scoring position, 2 out")) {
      rispRaw = info["Runners left in scoring position, 2 out"].value.replace(".", "");
      runners = rispRaw.replace(".", "").split(";");
    } else {
      rispRaw = "Rest Day!";
    }

    var gameTotal = 0;
    for (var runner of runners) {
      var qty = runner.match(/\d+/);
      if (qty == null) {
        gameTotal++;
      } else {
        gameTotal += parseInt(qty[0]);
      }
    }

    var tweet = {
      gameTotal: gameTotal,
      header: "#Miles4RISP " + vsAt + " " + opponent + " " + date,
      batters: runners,
      battersMsg: rispRaw,
      seasonTotal: addSeasonTotal(gameTotal)
    };
    console.log("tweet:\n" + printTweet(tweet));
    seasonTotals.set(boxScore.gameData.game.pk, tweet);
    return tweet;
    // callback(null, tweet);
  }
}


function printTweet(tweet) {
  var msg = tweet.gameTotal + " " + tweet.header + "\n" +
    tweet.battersMsg + "\n" +
    "Season Total: " + tweet.seasonTotal;
  return msg;
}

function addSeasonTotal(gameTotal) {
  return gameTotal + Array.from(seasonTotals.values()).reduce(function(tot, arr) {
    return tot + arr.gameTotal;
  }, 0);
}

// var backFillQueue = [];
//
// function backFillMe() {
//   backFillQueue = getDaysArray("2022-04-06", (new Date()).toISOString().split('T')[0]);
//   backfill();
// }
//
// function backfill() {
//   if (backFillQueue.length > 0) {
//     backFillForDate(backFillQueue.shift());
//   } else {
//     console.log("Backfill finished")
//   }
// }
//
// function backFillForDate(date) {
//   console.log("waiting 500ms to process " + date)
//   setTimeout(() => {
//     getDataForDate(date);
//     backfill();
//   }, 500);
// }
//
// function wakeUpAndPostData() {
//   var date = getPreviousDay(new Date()).toISOString().split('T')[0];
//   getDataForDate(date);
// }
//
// function getPreviousDay(date = new Date()) {
//   const previous = new Date(date.getTime());
//   previous.setDate(date.getDate() - 1);
//   return previous;
// }

function scheduleHttpOptions() {
  httpOptions = {
    hostname: HOST,
    path: SCHEDULE_URL,
    headers: {
      "Accept": "application/json"
    }
  };
}

function boxHttpOptions(gamePk) {
  var url = "/api/v1.1/game/" + gamePk + "/feed/live?language=en";
  httpOptions = {
    hostname: HOST,
    path: url,
    headers: {
      "Accept": "application/json"
    }
  };
}
