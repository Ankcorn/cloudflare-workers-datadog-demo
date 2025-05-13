
import { AsyncLocalStorage } from 'node:async_hooks';

type MetricsStore = {
	  metrics: Map<string, Metric>
	  tags: string[]
	  context: {
		apiKey: string
		apiUrl: string
	  }
}

type Metric = {
      metric: string
      type: string // 'gauge', 'count', 'histogram'
      tags: string[]
      points: [number, number][]
      // For histograms, we'll use intervals to define distribution
      intervals?: number[]
      values?: number[]
    };

const asyncLocalStorage = new AsyncLocalStorage<MetricsStore>();

export class Metrics {

  /**
   * Start a new context for tracking metrics
   * @param {Object} initialContext - Initial context data (e.g., request info)
   * @param {Function} callback - Function to execute within this context
   */
  run(initialContext: { apiKey: string; apiUrl: string; defaultTags?: string[] }, callback: () => Promise<Response> | Response) {
    const contextStore = {
      metrics: new Map(),
      tags: initialContext.defaultTags || [],
      context: {
		apiKey: initialContext.apiKey,
		apiUrl: initialContext.apiUrl,
	  }
    };

    return asyncLocalStorage.run(contextStore, callback);
  }

  /**
   * Get the current context's store
   * @returns {Object|null} The context store or null if not in a context
   */
  getStore() {
    return asyncLocalStorage.getStore();
  }

  /**
   * Add a tag to the current context
   * @param {String} name - Tag name
   * @param {String} value - Tag value
   */
  addTag(name:string, value:string) {
    const store = this.getStore();
    if (store) {
      store.tags.push(`${name}:${value}`);
    }
  }

  /**
   * Record a gauge metric
   * @param {String} name - Metric name
   * @param {Number} value - Metric value
   * @param {Array} tags - Additional tags
   */
  gauge(name: string, value: number, tags: string[] = []) {
    this.record(name, value, 'gauge', tags);
  }

  /**
   * Record a count metric
   * @param {String} name - Metric name
   * @param {Number} value - Metric value
   * @param {Array} tags - Additional tags
   */
  count(name: string, value: number, tags: string[] = []) {
    this.record(name, value, 'count', tags);
  }

  /**
   * Record a histogram metric
   * @param {String} name - Metric name
   * @param {Number} value - Metric value to add to the histogram
   * @param {Array} tags - Additional tags
   */
  histogram(name: string, value: number, tags: string[] = []) {
    this.record(name, value, 'histogram', tags);
  }


  /**
   * Internal method to record a metric
   * @private
   */
  record(name: string, value: number, type = 'gauge', additionalTags: string[] = []) {
	// Unix timestamp in seconds
    const timestamp = Math.floor(Date.now() / 1000);
    const store = this.getStore();
	if(!store) {
		console.warn('Metrics context not initialized. Please call run() before recording metrics.');
		return
	}
    const tags = [...store.tags, ...additionalTags];
    const metricKey = `${name}:${type}:${tags.sort().join(',')}`;

    const metric = {
      metric: name,
      type,
      tags,
      points: [[timestamp, value]] as [number, number][]
    };


	store.metrics.set(metricKey, metric);
  }

  /**
   * Get all metrics from the current context
   * @returns {Array} Array of metric objects
   */
  getContextMetrics() {
    const store = this.getStore();
    return store ? Array.from(store.metrics.values()) : [];
  }

  /**
   * Flush metrics from the current context
   * @returns {Promise} Promise that resolves when metrics are sent
   */
  async flush() {
    const metrics = this.getContextMetrics();
    const store = this.getStore();

    if (!store || metrics.length === 0) {
      return { status: 'no_metrics', sent: 0 };
    }



    try {
      const response = await fetch(store.context.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': store.context.apiKey
        },
        body: JSON.stringify({ series: metrics })
      });

      // Clear context metrics after successful submission
      if (response.ok) {
        store.metrics.clear();
      }


    } catch (error) {
      throw new Error(`Failed to send context metrics to Datadog: ${error}`);
    }
  }
}
