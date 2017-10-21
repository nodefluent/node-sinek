"use strict";

const STATES = {
  UNKNOWN: -2,
  UNCONNECTED: -1,
  HEALTHY: 0
};

const MESSAGES = {
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

    //TODO

    return super.createCheck(status, message);
  }
}

module.exports = {
  ConsumerHealth,
  ProducerHealth
};
