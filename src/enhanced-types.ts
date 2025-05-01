import { z } from 'zod';

// Custom error types
export interface MCPError extends Error {
  code?: string;
  retryable?: boolean;
  details?: unknown;
}

// Base schemas
export const BaseMCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  inputSchema: z.any(),
  outputSchema: z.any().optional(),
});

export const MCPContextSchema = z.object({
  requestId: z.string(),
  timestamp: z.number(),
  timeout: z.number().optional(),
  retryCount: z.number().optional(),
  parentContext: z.string().optional(),
});

export const MCPErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
  retryable: z.boolean(),
  suggestions: z.array(z.string()).optional(),
});

// Pipeline types
export interface PipelineStep<T = any, R = any> {
  toolName: string;
  params: T;
  condition?: (prevResult: R) => boolean;
  transform?: (prevResult: R) => T;
}

export interface Pipeline {
  steps: PipelineStep[];
  context?: z.infer<typeof MCPContextSchema>;
}

export const PipelineSchema = z.object({
  steps: z.array(z.object({
    toolName: z.string(),
    params: z.any(),
    condition: z.function().optional(),
    transform: z.function().optional()
  })),
  context: MCPContextSchema.optional()
});

// Metrics types
export interface MCPMetrics {
  requestDuration: number;
  toolName: string;
  success: boolean;
  errorType?: string;
  retryCount: number;
  timestamp: number;
}

// Linear-specific types
export const ListIssuesInputSchema = z.object({
  teamId: z.string().optional(),
  first: z.number().optional().default(50),
});

export const CreateIssueInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  teamId: z.string(),
  assigneeId: z.string().optional(),
  priority: z.number().optional(),
});

export const ListUsersInputSchema = z.object({
  first: z.number().optional().default(50),
  includeArchived: z.boolean().optional().default(false),
});

export const GetUserInputSchema = z.object({
  id: z.string(),
});

export const ListTeamsInputSchema = z.object({
  first: z.number().optional().default(50),
  includeArchived: z.boolean().optional().default(false),
});

export const GetTeamInputSchema = z.object({
  id: z.string(),
});

export const GetIssueInputSchema = z.object({
  id: z.string(),
});

export const ListIssueCommentsInputSchema = z.object({
  issueId: z.string(),
  first: z.number().optional().default(20),
});

export const CreateCommentInputSchema = z.object({
  issueId: z.string(),
  body: z.string(),
});

export type ListIssuesInput = z.infer<typeof ListIssuesInputSchema>;
export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
export type ListUsersInput = z.infer<typeof ListUsersInputSchema>;
export type GetUserInput = z.infer<typeof GetUserInputSchema>;
export type ListTeamsInput = z.infer<typeof ListTeamsInputSchema>;
export type GetTeamInput = z.infer<typeof GetTeamInputSchema>;
export type GetIssueInput = z.infer<typeof GetIssueInputSchema>;
export type ListIssueCommentsInput = z.infer<typeof ListIssueCommentsInputSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;

// Type guards with Zod
export const isValidListIssuesArgs = (args: unknown): args is ListIssuesInput => {
  return ListIssuesInputSchema.safeParse(args).success;
};

export const isValidIssueCreateArgs = (args: unknown): args is CreateIssueInput => {
  return CreateIssueInputSchema.safeParse(args).success;
};

export const isValidListUsersArgs = (args: unknown): args is ListUsersInput => {
  return ListUsersInputSchema.safeParse(args).success;
};

export const isValidGetUserArgs = (args: unknown): args is GetUserInput => {
  return GetUserInputSchema.safeParse(args).success;
};

export const isValidListTeamsArgs = (args: unknown): args is ListTeamsInput => {
  return ListTeamsInputSchema.safeParse(args).success;
};

export const isValidGetTeamArgs = (args: unknown): args is GetTeamInput => {
  return GetTeamInputSchema.safeParse(args).success;
};

export const isValidGetIssueArgs = (args: unknown): args is GetIssueInput => {
  return GetIssueInputSchema.safeParse(args).success;
};

export const isValidListIssueCommentsArgs = (args: unknown): args is ListIssueCommentsInput => {
  return ListIssueCommentsInputSchema.safeParse(args).success;
};

export const isValidCreateCommentArgs = (args: unknown): args is CreateCommentInput => {
  return CreateCommentInputSchema.safeParse(args).success;
};