"use strict";

const STATES = {
  DIS_ANALYTICS: -4,
  NO_ANALYTICS: -3,
  UNKNOWN: -2,
  UNCONNECTED: -1,
  HEALTHY: 0,
  WARNING: 1,
  CRITICAL: 2
};

const MESSAGES = {
  DIS_ANALYTICS: "Analytics are disabled, cannot measure required parameters. Please enable.",
  NO_ANALYTICS: "Analytics have not yet run, checks will be available after first run.",
  UNKNOWN: "State is unknown.",
  UNCONNECTED: "The client is not connected.",
  HEALTHY: "No problems detected, client is healthy."
};

class Health {

  constructor(client){
    this.client = client;

    //make them accessable
    this.STATES = STATES;
    this.MESSAGES = MESSAGES;
  }

  createCheck(status = STATES.HEALTHY, message = MESSAGES.HEALTHY){
    return {
      status,
      message
    };
  }
}

class ConsumerHealth extends Health {

  constructor(nconsumer){
    super(nconsumer);
  }

  async check(){

    let status = STATES.UNKNOWN;
    let message = MESSAGES.UNKNOWN;

    if(!this.client.consumer){
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if(!this.client._analytics){
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if(!analytics){
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    //TODO

    return super.createCheck(status, message);
  }
}

class ProducerHealth extends Health {

  constructor(nproducer){
    super(nproducer);
  }

  async check(){

    let status = STATES.UNKNOWN;
    let message = MESSAGES.UNKNOWN;

    if(!this.client.producer){
      return super.createCheck(STATES.UNCONNECTED, MESSAGES.UNCONNECTED);
    }

    if(!this.client._analytics){
      return super.createCheck(STATES.DIS_ANALYTICS, MESSAGES.DIS_ANALYTICS);
    }

    const analytics = this.client._analytics.getLastResult();

    if(!analytics){
      return super.createCheck(STATES.NO_ANALYTICS, MESSAGES.NO_ANALYTICS);
    }

    //TODO

    return super.createCheck(status, message);
  }
}

module.exports = {
  ConsumerHealth,
  ProducerHealth
};
