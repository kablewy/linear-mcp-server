import { Pipeline, PipelineStep, MCPErrorSchema, MCPError, PipelineSchema } from './enhanced-types.js';
import { randomUUID } from 'crypto';

export class PipelineProcessor {
  constructor(private toolExecutor: (name: string, params: any) => Promise<any>) {}

  async executePipeline(pipelineInput: unknown): Promise<any[]> {
    // Validate pipeline input
    const parseResult = PipelineSchema.safeParse(pipelineInput);
    if (!parseResult.success) {
      throw new Error('Invalid pipeline configuration');
    }

    const pipeline = parseResult.data;
    const context = {
      requestId: randomUUID(),
      timestamp: Date.now(),
      ...pipeline.context
    };

    const results: any[] = [];
    let prevResult: any = null;

    for (const step of pipeline.steps) {
      try {
        if (step.condition && !step.condition(prevResult)) {
          continue;
        }

        const params = step.transform 
          ? step.transform(prevResult)
          : step.params;

        const result = await this.toolExecutor(step.toolName, params);
        results.push(result);
        prevResult = result;

      } catch (error) {
        const mcpError: MCPError = new Error('Pipeline step failed');
        mcpError.code = error instanceof Error && 'code' in error 
          ? (error as any).code 
          : 'PIPELINE_STEP_ERROR';
        mcpError.message = error instanceof Error ? error.message : String(error);
        mcpError.retryable = false;
        throw mcpError;
      }
    }

    return results;
  }

  // Helper method to create common pipelines
  static createListAndProcessPipeline(
    listParams: any,
    processFunction: (item: any) => any
  ): Pipeline {
    return {
      steps: [
        {
          toolName: 'listIssues',
          params: listParams
        },
        {
          toolName: 'createIssue',
          params: {}, // Empty initial params
          condition: results => results && results.length > 0,
          transform: results => processFunction(results[0])
        }
      ]
    };
  }
}