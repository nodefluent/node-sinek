"use strict";

/**
 * wrapper arround node-librdkafka metadata object
 */
class Metadata {

  /**
   * creates a new instance
   * @param {object} raw - metadata object response of node-librdkafka client
   */
  constructor(raw){
    this.raw = raw;
  }

  /**
   * @throws
   * returns the count of partitions of the given topic
   * @param {string} topicName - name of the kafka topic
   * @returns {number}
   */
  getPartitionCountOfTopic(topicName){

    const topic = this.raw.topics.filter(topic => topic.name === topicName)[0];

    if(!topic){
      throw new Error(topicName + " does not exist in fetched metadata.");
    }

    return topic.partitions.length;
  }

  /**
   * @throws
   * returns a list of topic names
   */
  asTopicList(){
    return this.raw.topics.map(topic => topic.name);
  }

  /**
   * @throws
   * gets formatted metadata information about give topic
   * @param {string} topicName - name of the kafka topic
   * @returns {object}
   */
  asTopicDescription(topicName){

    if(!this.raw.topics || !this.raw.topics.length){
      return {};
    }

    let topic = null;
    for(let i = 0; i < this.raw.topics.length; i++){
      if(this.raw.topics[i].name === topicName){
        topic = this.raw.topics[i];
        break;
      }
    }

    if(!topic){
      return {};
    }

    return {
      name: topic.name,
      configs: null,
      partitions: Metadata.formatPartitions(topic.partitions)
    };
  }

  /**
   * @throws
   * gets a list of formatted partition info for topic
   * @param {string} topicName - name of the kafka topic
   * @returns {Array}
   */
  asTopicPartitions(topicName){

    if(!this.raw.topics || !this.raw.topics.length){
      return {};
    }

    let topic = null;
    for(let i = 0; i < this.raw.topics.length; i++){
      if(this.raw.topics[i].name === topicName){
        topic = this.raw.topics[i];
        break;
      }
    }

    if(!topic){
      return {};
    }

    return Metadata.formatPartitions(topic.partitions);
  }

  /**
   * @throws
   * gets a broker object (list of broker ids)
   * @returns {object}
   */
  asBrokers(){
    return {
      brokers: this.raw.brokers.map(broker => broker.id)
    };
  }

  /**
   * @throws
   * maps partitions into kafka-rest format
   * @param {Array} partitions - array of partitions
   * @returns {Array}
   */
  static formatPartitions(partitions){
    return partitions.map((p)=> {
      p.partition=p.id;
      p.replicas = p.replicas.map((r)=>({ broker: r, in_sync: p.isrs.indexOf(r) !== -1, leader: r === p.leader }));
      delete p.id;
      delete p.isrs;
      return p;
    });
  }
}

module.exports = Metadata;
