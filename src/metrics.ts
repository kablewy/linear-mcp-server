import { MCPMetrics } from './enhanced-types.js';

export class MetricsCollector {
  private metrics: MCPMetrics[] = [];
  private readonly maxMetricsCount: number = 1000;

  record(metric: Omit<MCPMetrics, 'timestamp'>): void {
    const fullMetric: MCPMetrics = {
      ...metric,
      timestamp: Date.now()
    };

    this.metrics.push(fullMetric);

    // Keep only the last maxMetricsCount metrics
    if (this.metrics.length > this.maxMetricsCount) {
      this.metrics = this.metrics.slice(-this.maxMetricsCount);
    }
  }

  getMetrics(): MCPMetrics[] {
    return [...this.metrics];
  }

  getMetricsForTool(toolName: string): MCPMetrics[] {
    return this.metrics.filter(m => m.toolName === toolName);
  }

  getErrorRate(toolName?: string): number {
    const relevantMetrics = toolName 
      ? this.getMetricsForTool(toolName)
      : this.metrics;

    if (relevantMetrics.length === 0) return 0;

    const errorCount = relevantMetrics.filter(m => !m.success).length;
    return errorCount / relevantMetrics.length;
  }

  getAverageRequestDuration(toolName?: string): number {
    const relevantMetrics = toolName 
      ? this.getMetricsForTool(toolName)
      : this.metrics;

    if (relevantMetrics.length === 0) return 0;

    const totalDuration = relevantMetrics.reduce((sum, m) => sum + m.requestDuration, 0);
    return totalDuration / relevantMetrics.length;
  }

  reset(): void {
    this.metrics = [];
  }
}