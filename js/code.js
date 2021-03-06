const VERSION = "v1.0";
const SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule?lang=en&sportId=1&season=2022&teamId=136&startDate=2022-04-06&endDate=2022-10-10"

var seasonTotals = new Map();


var schedule = new Map();

$(function() {
  feather.replace();
  $(".version-span").text(VERSION);

  $("#footer-row").mouseenter(
    function() {
      openSocial();
    }).mouseleave(
    function() {
      closeSocial();
    });

  getSchedule();

  // End initialization
});

function toggleSocial() {
  if ($(".social").width() == 0) {
    openSocial();
  } else {
    closeSocial()
  }
}

function openSocial() {
  $(".social").width(250);
}

function closeSocial() {
  $(".social").width(0);
}



// Code for Lambda
function getSchedule() {
  console.log("Getting Season Data");
  var url =

    fetch(SCHEDULE_URL, {})
    .then(function(response) {
      response.text().then(function(text) {
        schedule = new Map();
        JSON.parse(text).dates.forEach(object => {
          schedule.set(object.date, object);
        });
      });
    })
    .catch(function(err) {
      console.log("Error: " + err);
    });
}

function getBoxScore(gamePk) {
  if (seasonTotals.has(gamePk)) {
    printTweet(seasonTotals.get(gamePk));
  } else {
    console.log("Getting Box Score Data for " + gamePk);
    var url = "https://statsapi.mlb.com/api/v1.1/game/" + gamePk + "/feed/live?language=en";

    fetch(url, {})
      .then(function(response) {
        response.text().then(function(text) {
          processBox(JSON.parse(text));
        });
      })
      .catch(function(err) {
        console.log("Error: " + err);
        window.location.href = "error.html"
      });
  }
}

function getDataForDate(date) {
  if (!schedule.has(date)) {
    console.log("No games played on " + date);
  } else {
    var gamePks = [];
    var data = schedule.get(date).games;
    for (game of data) {
      gamePks.push(game.gamePk);
    }
    var i = 0;
    for (gamePk of gamePks) {
      var msSleep = i * 250;
      if (i > 0) {
        console.log("waiting " + msSleep + "ms to process " + gamePk)
      }
      setTimeout(() => {
        getBoxScore(gamePk);
      }, msSleep);
      i++;
    }
  }
}

function processBox(boxScore) {
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
    } else {
      console.log("Game has not ended");
    }
  } else {
    var info = boxScore.liveData.boxscore.teams[loc].info[0].fieldList;
    info = info.reduce(function(map, obj) {
      map[obj.label] = obj;
      return map;
    }, {});

    if (info.hasOwnProperty("Runners left in scoring position, 2 out")) {
      var rispRaw = info["Runners left in scoring position, 2 out"].value.replace(".", "");
      var runners = rispRaw.replace(".", "").split(";")
    } else {
      var rispRaw = "Rest Day!";
      var runners = [];
    }

    var gameTotal = 0;
    for (runner of runners) {
      var qty = runner.match(/\d+/);
      if (qty == null) {
        gameTotal++;
      } else {
        gameTotal += parseInt(qty[0])
      }
    }

    var tweet = {
      gameTotal: gameTotal,
      header: "#Miles4RISP " + vsAt + " " + opponent + " " + date,
      batters: rispRaw,
      seasonTotal: addSeasonTotal(gameTotal)
    };
    seasonTotals.set(boxScore.gameData.game.pk, tweet);
    printTweet(tweet);
  }
}

function printTweet(tweet) {
  var msg = tweet.gameTotal + " " + tweet.header + "\n" +
    tweet.batters + "\n" +
    "Season Total: " + tweet.seasonTotal;
  var newHtml = $("#result").html();
  newHtml += "----------------\n" + msg + "\n----------------";
  $("#result").html(newHtml);

}

function addSeasonTotal(gameTotal) {
  return gameTotal + Array.from(seasonTotals.values()).reduce(function(tot, arr) {
    return tot + arr.gameTotal;
  }, 0);
}

function getDaysArray(start, end) {
  var arr = [];
  for (dt = new Date(start); dt <= new Date(end); dt.setDate(dt.getDate() + 1)) {
    arr.push((new Date(dt)).toISOString().split('T')[0]);
  }
  return arr;
};


var backFillQueue = [];

function backFillMe() {
  backFillQueue = getDaysArray("2022-04-06", (new Date()).toISOString().split('T')[0]);
  backfill();
}

function backfill() {
  if (backFillQueue.length > 0) {
    backFillForDate(backFillQueue.shift());
  } else {
    console.log("Backfill finished")
  }
}

function backFillForDate(date) {
  console.log("waiting 500ms to process " + date)
  setTimeout(() => {
    getDataForDate(date);
    backfill();
  }, 500);
}

function wakeUpAndPostData() {
  var date = getPreviousDay(new Date()).toISOString().split('T')[0];
  getDataForDate(date);
}

function getPreviousDay(date = new Date()) {
  const previous = new Date(date.getTime());
  previous.setDate(date.getDate() - 1);
  return previous;
}
