const express = require("express");
const {Kafka, PartitionDrainer} = require("../index.js");

const logger = {
  //debug: msg => console.log("consumer: " + msg),
  debug: () => {}, //silence
  info: msg => console.log("consumer: " + msg),
  warn: msg => console.log("consumer: " + msg),
  error: msg => console.log("consumer: " + msg)
};

const topicName = "partition-test-3";
const conStr = "localhost:2181";
const groupId = "partition-test-2";

const options = {
  fetchMaxBytes: 1024 * 10,
  sessionTimeout: 8000,
  heartbeatInterval: 250,
  retryMinTimeout: 250,
  fromOffset: "earliest",
};

const kafka = new Kafka(conStr, logger);
kafka.becomeManualConsumer([topicName], groupId, options);
kafka.on("error", err => console.log("consumer error: " + err));

let pd = null;
kafka.on("ready", () => {
  pd = new PartitionDrainer(kafka, 1, false);
  pd.disablePauseResume = true;
  pd.drain(topicName, onMessage).then(() => {console.log("load-test running.");}).catch(e => console.log(e));
});

let totalMsg = 0;
let msgCount = {};
function onMessage(message, done){

  if(!msgCount[message.partition]){
    msgCount[message.partition] = 0;
  }

  totalMsg++;
  msgCount[message.partition]++;
  done();
}

setInterval(() => {
  console.log("\\033[2J"); //octal -> no strict
  console.log("load-test running:");
  console.log(JSON.stringify({
    total: totalMsg,
    partitions: msgCount
  }, null, 4));
}, 3000);

const app = express();

app.get("/", (req, res) => {
  res.json(pd.getStats());
});

app.get("/earliest", (req, res) => {
  kafka.getEarliestOffsets(topicName).then(offsets => res.json(offsets)).catch(e => res.json(e));
});

app.get("/latest", (req, res) => {
  kafka.getOffsets(topicName).then(offsets => res.json(offsets)).catch(e => res.json(e));
});

app.listen(8080, () => {
  console.log("check stats @ http://localhost:8080/");
});
