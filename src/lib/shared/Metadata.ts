import { ITopicMetadata } from 'kafkajs';

/**
 * wrapper arround node-librdkafka metadata object
 */
export class Metadata {
  
  raw: {
    topics: ITopicMetadata[] | [];
  } = {topics: []};

  /**
   * creates a new instance
   * @param {object} raw - metadata object response of node-librdkafka client
   */
  constructor(raw) {
    this.raw = raw;
  }

  /**
   * @throws
   * returns the count of partitions of the given topic
   * @param {string} topicName - name of the kafka topic
   * @returns {number}
   */
  getPartitionCountOfTopic(topicName) {

    const topic = this.raw.topics.filter(topic => topic.name === topicName).pop();

    if (!topic) {
      throw new Error(topicName + " does not exist in fetched metadata.");
    }

    return topic.partitions.length;
  }

  /**
   * @throws
   * returns a partition (id) array of the given topic
   * @param {string} topicName - name of the kafka topic
   * @returns {Array<number>}
   */
  getPartitionsForTopic(topicName) {

    const topic = this.raw.topics.filter((topic:ITopicMetadata) => topic.name === topicName).pop();

    if (!topic) {
      throw new Error(topicName + " does not exist in fetched metadata.");
    }

    return topic.partitions.map((partition) => partition.partitionId);
  }

  /**
   * @throws
   * returns a list of topic names
   */
  asTopicList() {
    return this.raw.topics
      .filter((topic:ITopicMetadata) => topic.name !== "__consumer_offsets")
      .map((topic: ITopicMetadata) => topic.name);
  }

  /**
   * @throws
   * gets formatted metadata information about give topic
   * @param {string} topicName - name of the kafka topic
   * @returns {object}
   */
  asTopicDescription(topicName) {

    if (!this.raw.topics || !this.raw.topics.length) {
      return {};
    }

    let topic;
    for (let i = 0; i < this.raw.topics.length; i++) {
      if (this.raw.topics[i].name === topicName) {
        topic = this.raw.topics[i];
        break;
      }
    }

    if (!topic) {
      return {};
    }
    
    return {
      // @ts-ignore
      name: topic.name,
      configs: null,
      // @ts-ignore
      partitions: Metadata.formatPartitions(topic.partitions)
    };
  }

  /**
   * @throws
   * gets a list of formatted partition info for topic
   * @param {string} topicName - name of the kafka topic
   * @returns {Array}
   */
  asTopicPartitions(topicName: string): object {

    if (!this.raw.topics || !this.raw.topics.length) {
      return {};
    }

    let topic: object | null = null;
    for (let i = 0; i < this.raw.topics.length; i++) {
      if (this.raw.topics[i].name === topicName) {
        topic = this.raw.topics[i];
        break;
      }
    }

    if (!topic) {
      return {};
    }
    // @ts-ignore
    return Metadata.formatPartitions(topic.partitions);
  }

  /**
   * @deprecated
   * @throws
   * gets a broker object (list of broker ids)
   * @returns {object}
   */
  asBrokers() {
    return {
      brokers: []
    };
  }

  /**
   * @throws
   * maps partitions into kafka-rest format
   * @param {Array} partitions - array of partitions
   * @returns {Array}
   */
  static formatPartitions(partitions): [] {
    return partitions.map((p) => {
      p.partition = p.id;
      p.replicas = p.replicas.map((r) => ({ broker: r, in_sync: p.isrs.indexOf(r) !== -1, leader: r === p.leader }));
      delete p.id;
      delete p.isrs;
      return p;
    });
  }
}
