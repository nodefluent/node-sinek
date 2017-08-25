"use strict";

const {NConsumer, NProducer} = require("./../../index.js");

describe("NSinek INT", () => {

  let consumer = null;
  let producer = null;

  before(done => {
    producer = new NProducer();
    consumer = new NConsumer();
  });

  after(done => {

  });

});
