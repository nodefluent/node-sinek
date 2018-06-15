"use strict";

const assert = require("assert");

const {
  Health
} = require("./../../index.js");
const {
  ConsumerHealth,
  ProducerHealth
} = Health;

describe("Health UNIT", () => {

  const getFakeProducerAnalyticsResult = (produced = 0, errors = 0) => {
    return {
      generatedAt: 1508679543026,
      interval: 500,
      produced,
      errors
    };
  };

  const getFakeConsumerAnalyticsResult = (highDistance = 0, consumed = 0, errors = 0) => {
    return {
      "generatedAt": 1508679543026,
      "interval": 500,
      "lagChange": {
        "timelyDifference": 1001,
        "fetchPerformance": -7,
        "newLags": {},
        "changedLags": {},
        "resolvedLags": {
          "n-test-topic": {
            "0": 0
          }
        },
        "stallLags": {}
      },
      "largestLag": {
        "topic": "n-test-topic",
        "partition": 0,
        "lowDistance": 337,
        highDistance,
        "detail": {
          "lowOffset": 0,
          "highOffset": 337,
          "comittedOffset": 337
        }
      },
      consumed,
      errors
    };
  };

  const getFakeProducer = (ares = {}) => {
    return {
      producer: true,
      _analytics: {
        getLastResult: () => {
          return ares;
        }
      }
    };
  };

  const getFakeConsumer = (ares = {}) => {
    return {
      consumer: true,
      _analytics: {
        getLastResult: () => {
          return ares;
        }
      }
    };
  };

  const getPHI = fakeClient => new ProducerHealth(fakeClient);
  const getCHI = fakeClient => new ConsumerHealth(fakeClient);

  it("should be healthy", () => {

    const ph = getPHI(getFakeProducer(getFakeProducerAnalyticsResult(100, 0)));
    const ch = getCHI(getFakeConsumer(getFakeConsumerAnalyticsResult(0, 100, 0)));

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, 0);
      assert.equal(res[1].status, 0);
    });
  });

  it("should be critical", () => {

    const ph = getPHI(getFakeProducer(getFakeProducerAnalyticsResult(0, 100)));
    const ch = getCHI(getFakeConsumer(getFakeConsumerAnalyticsResult(0, 0, 100)));

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, 3);
      assert.equal(res[0].messages.length, 2);
      assert.equal(res[1].status, 3);
      assert.equal(res[1].messages.length, 2);
    });
  });

  it("should be risky", () => {

    const ph = getPHI(getFakeProducer(getFakeProducerAnalyticsResult(0, 2)));
    const ch = getCHI(getFakeConsumer(getFakeConsumerAnalyticsResult(0, 0, 2)));

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, 1);
      assert.equal(res[1].status, 1);
    });
  });

  it("should be a warning", () => {

    const ch = getCHI(getFakeConsumer(getFakeConsumerAnalyticsResult(1001, 100, 0)));

    return Promise.all([
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, 2);
      assert.equal(res[0].messages.length, 1);
    });
  });

  it("should be no analytics", () => {

    const ph = getPHI(getFakeProducer(null));
    const ch = getCHI(getFakeConsumer(null));

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, -3);
      assert.equal(res[1].status, -3);
    });
  });

  it("should be disabled analytics", () => {

    const ph = getPHI({
      producer: true
    });
    const ch = getCHI({
      consumer: true
    });

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, -4);
      assert.equal(res[1].status, -4);
    });
  });

  it("should be not connected", () => {

    const ph = getPHI({
      producer: false
    });
    const ch = getCHI({
      consumer: false
    });

    return Promise.all([
      ph.check(),
      ch.check()
    ]).then(res => {
      assert.equal(res[0].status, -1);
      assert.equal(res[1].status, -1);
    });
  });

});
