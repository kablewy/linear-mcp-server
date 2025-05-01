#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LinearClient } from "@linear/sdk";
import { 
  isValidListIssuesArgs, 
  isValidIssueCreateArgs,
  isValidListUsersArgs,
  isValidGetUserArgs,
  isValidListTeamsArgs,
  isValidGetTeamArgs,
  isValidGetIssueArgs,
  isValidListIssueCommentsArgs,
  isValidCreateCommentArgs,
  MCPErrorSchema,
  MCPError,
  Pipeline
} from "./enhanced-types.js";
import { MetricsCollector } from "./metrics.js";
import { PipelineProcessor } from "./pipeline.js";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.LINEAR_API_KEY) {
  throw new Error("LINEAR_API_KEY environment variable is required");
}

class EnhancedLinearServer {
  private server: Server;
  private client: LinearClient;
  private metrics: MetricsCollector;
  private pipelineProcessor: PipelineProcessor;

  constructor() {
    this.server = new Server({
      name: "linear-mcp-server",
      version: "0.4.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.client = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY
    });

    this.metrics = new MetricsCollector();
    this.pipelineProcessor = new PipelineProcessor(this.executeTool.bind(this));

    this.setupHandlers();
    this.setupErrorHandling();
    this.setupMetricsReporting();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: unknown) => {
      const mcpError: MCPError = new Error('Server error');
      mcpError.code = error instanceof Error && 'code' in error 
        ? (error as any).code 
        : 'SERVER_ERROR';
      mcpError.message = error instanceof Error ? error.message : String(error);
      mcpError.retryable = true;
      console.error("[MCP Error]", mcpError);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupMetricsReporting(): void {
    setInterval(() => {
      const errorRate = this.metrics.getErrorRate();
      const avgDuration = this.metrics.getAverageRequestDuration();
      
      console.error("[MCP Metrics] Error Rate:", errorRate);
      console.error("[MCP Metrics] Avg Duration:", avgDuration + "ms");
      
      ["list_issues", "create_issue", "list_users", "get_user", "list_teams", "get_team", "get_issue", "list_issue_comments", "create_comment", "execute_pipeline"].forEach(tool => {
        const toolErrorRate = this.metrics.getErrorRate(tool);
        const toolAvgDuration = this.metrics.getAverageRequestDuration(tool);
        console.error(`[MCP Metrics] ${tool} - Error Rate:`, toolErrorRate);
        console.error(`[MCP Metrics] ${tool} - Avg Duration:`, toolAvgDuration + "ms");
      });
    }, 5 * 60 * 1000);
  }

  private async executeTool(name: string, params: any): Promise<any> {
    const startTime = Date.now();
    try {
      let result;
      switch (name) {
        case "list_issues": {
          if (params && typeof params !== 'object') {
            throw new Error("Invalid list issues arguments: Expected an object or undefined");
          }
          const filter: any = {};
          if (params?.teamId) filter.team = { id: { eq: params.teamId } };
          if (params?.projectId) filter.project = { id: { eq: params.projectId } };
          if (params?.labelId) filter.labels = { id: { eq: params.labelId } };
          if (params?.stateId) filter.state = { id: { eq: params.stateId } };
          if (params?.priority !== undefined) filter.priority = { eq: params.priority };
          if (params?.assigneeId) filter.assignee = { id: { eq: params.assigneeId } };

          const issuesResult = await this.client.issues({ 
            first: params?.first, 
            filter: Object.keys(filter).length > 0 ? filter : undefined 
          });
          const mappedNodes = await Promise.all(issuesResult.nodes.map(async (issue) => {
            const state = await issue.state;
            return {
              id: issue.id,
              title: issue.title,
              status: state?.name
            };
          }));
          result = { nodes: mappedNodes };
          break;
        }
        case "create_issue": {
          if (!isValidIssueCreateArgs(params)) {
            throw new Error("Invalid issue creation arguments");
          }
          result = await this.client.createIssue(params);
          break;
        }
        case "list_users": {
          if (params && typeof params !== 'object') { 
            throw new Error("Invalid list users arguments: Expected an object or undefined");
          }
          const usersResult = await this.client.users(params);
          result = { 
            nodes: usersResult.nodes.map(user => ({ 
              id: user.id, 
              name: user.name, 
              displayName: user.displayName 
            }))
          };
          break;
        }
        case "get_user": {
          if (!isValidGetUserArgs(params)) {
            throw new Error("Invalid get user arguments");
          }
          result = await this.client.user(params.id);
          break;
        }
        case "list_teams": {
          if (params && typeof params !== 'object') { 
            throw new Error("Invalid list teams arguments: Expected an object or undefined");
          }
          const teamsResult = await this.client.teams(params);
          result = { 
            nodes: teamsResult.nodes.map(team => ({ 
              id: team.id, 
              name: team.name, 
              key: team.key 
            }))
          };
          break;
        }
        case "get_team": {
          if (!isValidGetTeamArgs(params)) {
            throw new Error("Invalid get team arguments");
          }
          result = await this.client.team(params.id);
          break;
        }
        case "get_issue": {
          if (!isValidGetIssueArgs(params)) {
            throw new Error("Invalid get issue arguments");
          }
          result = await this.client.issue(params.id);
          break;
        }
        case "list_issue_comments": {
          if (!isValidListIssueCommentsArgs(params)) {
            throw new Error("Invalid list issue comments arguments");
          }
          const issue = await this.client.issue(params.issueId);
          result = await issue.comments({ first: params.first });
          break;
        }
        case "create_comment": {
          if (!isValidCreateCommentArgs(params)) {
            throw new Error("Invalid create comment arguments");
          }
          result = await this.client.createComment({
            issueId: params.issueId,
            body: params.body
          });
          break;
        }
        case "list_cycles": {
          if (params && typeof params !== 'object') { 
            throw new Error("Invalid list cycles arguments: Expected an object or undefined");
          }
          if (params?.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid list cycles arguments: 'first' must be a number");
          }
          const cyclesResult = await this.client.cycles(params);
          result = {
            nodes: cyclesResult.nodes.map(cycle => ({
              id: cycle.id,
              name: cycle.name,
              number: cycle.number
            }))
          };
          break;
        }
        case "get_cycle": {
          if (!params || typeof params !== 'object' || typeof params.id !== 'string') {
            throw new Error("Invalid get cycle arguments: 'id' (string) is required");
          }
          result = await this.client.cycle(params.id);
          break;
        }
        case "get_cycle_issues": {
          if (!params || typeof params !== 'object' || typeof params.cycleId !== 'string') {
            throw new Error("Invalid get cycle issues arguments: 'cycleId' (string) is required");
          }
          if (params.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid get cycle issues arguments: 'first' must be a number");
          }
          const cycle = await this.client.cycle(params.cycleId);
          const issuesResult = await cycle.issues({ first: params.first });
          const mappedNodes = await Promise.all(issuesResult.nodes.map(async (issue) => {
            const state = await issue.state;
            return {
              id: issue.id,
              title: issue.title,
              status: state?.name
            };
          }));
          result = { nodes: mappedNodes };
          break;
        }
        case "explore_cycle_issue": {
          if (!params || typeof params !== 'object' || typeof params.id !== 'string') {
            throw new Error("Invalid explore cycle issue arguments: 'id' (string) is required");
          }
          result = await this.client.issue(params.id);
          break;
        }
        case "list_projects": {
          if (params?.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid list projects arguments: 'first' must be a number");
          }
          const projectsResult = await this.client.projects({ first: params?.first });
          result = {
            nodes: projectsResult.nodes.map(project => ({
              id: project.id,
              name: project.name,
              state: project.state
            }))
          };
          break;
        }
        case "list_labels": {
          if (params?.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid list labels arguments: 'first' must be a number");
          }
           const labelsResult = await this.client.issueLabels({ first: params?.first });
           result = {
             nodes: labelsResult.nodes.map(label => ({
               id: label.id,
               name: label.name,
               color: label.color
             }))
           };
          break;
        }
        case "list_workflow_states": {
          if (params?.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid list workflow states arguments: 'first' must be a number");
          }
           if (params?.teamId && typeof params.teamId !== 'string') {
             throw new Error("Invalid list workflow states arguments: 'teamId' must be a string");
           }
          const filter: any = {};
          if (params?.teamId) filter.team = { id: { eq: params.teamId } };

          const statesResult = await this.client.workflowStates({ 
            first: params?.first,
            filter: Object.keys(filter).length > 0 ? filter : undefined 
          });
          const mappedNodes = await Promise.all(statesResult.nodes.map(async (state) => {
            const team = await state.team;
            return {
              id: state.id,
              name: state.name,
              type: state.type,
              team: team ? { id: team.id, name: team.name } : null
            };
          }));
          result = { nodes: mappedNodes };
          break;
        }
        case "get_project": {
          if (!params || typeof params !== 'object' || typeof params.id !== 'string') {
            throw new Error("Invalid get project arguments: 'id' (string) is required");
          }
          result = await this.client.project(params.id);
          break;
        }
        case "get_label": {
          if (!params || typeof params !== 'object' || typeof params.id !== 'string') {
            throw new Error("Invalid get label arguments: 'id' (string) is required");
          }
          result = await this.client.issueLabel(params.id);
          break;
        }
        case "get_workflow_state": {
          if (!params || typeof params !== 'object' || typeof params.id !== 'string') {
            throw new Error("Invalid get workflow state arguments: 'id' (string) is required");
          }
          result = await this.client.workflowState(params.id);
          break;
        }
        case "update_issue": {
           // Basic inline validation
           if (!params || typeof params !== 'object' || typeof params.issueId !== 'string') {
             throw new Error("Invalid update issue arguments: 'issueId' (string) is required");
           }
           // Construct payload for updateIssue
           const payload: any = {};
           if (params.title !== undefined) payload.title = params.title;
           if (params.description !== undefined) payload.description = params.description;
           if (params.projectId !== undefined) {
             payload.projectId = params.projectId === null ? "" : params.projectId;
           }
           if (params.stateId !== undefined) payload.stateId = params.stateId;
           if (params.priority !== undefined) payload.priority = params.priority;
           if (params.assigneeId !== undefined) {
             payload.assigneeId = params.assigneeId === null ? "" : params.assigneeId;
           }
           if (params.parentId !== undefined) {
             payload.parentId = params.parentId === null ? "" : params.parentId;
           }
           if (params.addLabelIds !== undefined) payload.labelIds = [...(payload.labelIds || []), ...params.addLabelIds];
           if (params.removeLabelIds !== undefined) {
              // Linear SDK likely requires fetching the issue first to get current labelIds 
              // and then calculating the final set. For simplicity here, we assume 
              // the SDK might handle removal implicitly or this needs refinement later.
              // Let's try passing the labelIds to add and assume removal needs separate logic or a full list.
              // A more robust approach: fetch issue, get current labels, filter out removeLabelIds, add addLabelIds.
              console.warn("[MCP Server] Removing labels via update_issue might require fetching current labels first. Current implementation only adds.");
           } // TODO: Implement robust label removal if needed

          result = await this.client.updateIssue(params.issueId, payload);
          break;
        }
        case "add_issue_relation": {
          if (!params || typeof params !== 'object' || 
              typeof params.issueId !== 'string' || 
              typeof params.relatedIssueId !== 'string' || 
              typeof params.type !== 'string' || 
              !['related', 'blocks', 'duplicate'].includes(params.type)) {
            throw new Error("Invalid add issue relation arguments: issueId, relatedIssueId, and type ('related', 'blocks', 'duplicate') are required.");
          }
          result = await this.client.createIssueRelation({ 
            issueId: params.issueId, 
            relatedIssueId: params.relatedIssueId, 
            type: params.type 
          });
          break;
        }
        case "remove_issue_relation": {
          if (!params || typeof params !== 'object' || typeof params.relationId !== 'string') {
            throw new Error("Invalid remove issue relation arguments: 'relationId' (string) is required.");
          }
          result = await this.client.deleteIssueRelation(params.relationId);
          break;
        }
        case "list_issue_relations": {
           if (!params || typeof params !== 'object' || typeof params.issueId !== 'string') {
             throw new Error("Invalid list issue relations arguments: 'issueId' (string) is required.");
           }
           if (params.first !== undefined && typeof params.first !== 'number') {
             throw new Error("Invalid list issue relations arguments: 'first' must be a number");
           }
           // Fetch the issue first, then get its relations
           const issue = await this.client.issue(params.issueId);
           if (!issue) {
             throw new Error(`Issue not found: ${params.issueId}`);
           }
           result = await issue.relations({ first: params.first });
           break;
        }
        case "execute_pipeline": {
          result = await this.pipelineProcessor.executePipeline(params.steps);
          break;
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      this.metrics.record({
        toolName: name,
        requestDuration: Date.now() - startTime,
        success: true,
        retryCount: 0
      });

      return result;
    } catch (error) {
      this.metrics.record({
        toolName: name,
        requestDuration: Date.now() - startTime,
        success: false,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        retryCount: 0
      });
      throw error;
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [
          {
            name: "list_issues",
            description: "List issues from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                teamId: {
                  type: "string",
                  description: "ID of the team to list issues from (optional)"
                },
                first: {
                  type: "number",
                  description: "Number of issues to fetch (optional, default: 50)"
                },
                projectId: {
                  type: "string",
                  description: "Filter issues by project ID (optional)"
                },
                labelId: {
                  type: "string",
                  description: "Filter issues by label ID (optional)"
                },
                stateId: {
                  type: "string",
                  description: "Filter issues by state ID (optional)"
                },
                priority: {
                  type: "number",
                  description: "Filter issues by priority (0-4, optional)"
                },
                assigneeId: {
                  type: "string",
                  description: "Filter issues by assignee ID (optional)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      status: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "create_issue",
            description: "Create a new issue in Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Title of the issue"
                },
                description: {
                  type: "string",
                  description: "Description of the issue"
                },
                teamId: {
                  type: "string",
                  description: "ID of the team"
                },
                assigneeId: {
                  type: "string",
                  description: "ID of the assignee (optional)"
                },
                priority: {
                  type: "number",
                  description: "Priority of the issue (optional)"
                }
              },
              required: ["title", "teamId"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                status: { type: "string" }
              }
            }
          },
          {
            name: "list_users",
            description: "List users from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of users to fetch (optional, default: 50)"
                },
                includeArchived: {
                  type: "boolean",
                  description: "Whether to include archived users (optional, default: false)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      displayName: { type: "string" },
                      email: { type: "string" },
                      active: { type: "boolean" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "get_user",
            description: "Get a specific user from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the user to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                displayName: { type: "string" },
                email: { type: "string" },
                active: { type: "boolean" }
              }
            }
          },
          {
            name: "list_teams",
            description: "List teams from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of teams to fetch (optional, default: 50)"
                },
                includeArchived: {
                  type: "boolean",
                  description: "Whether to include archived teams (optional, default: false)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      key: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "get_team",
            description: "Get a specific team from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the team to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                key: { type: "string" }
              }
            }
          },
          {
            name: "get_issue",
            description: "Get a specific issue from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the issue to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string" },
                assignee: { 
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    displayName: { type: "string" }
                  }
                },
                parent: { // Basic info for parent
                  type: ["object", "null"],
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" }
                  }
                },
                children: { // List of basic info for children
                  type: "object",
                  properties: {
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" }
                        }
                      }
                    }
                  }
                },
                relatedIssues: { // List of basic info
                  type: "object",
                  properties: {
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" }
                        }
                      }
                    }
                  }
                },
                blockedByIssues: { // List of basic info
                  type: "object",
                  properties: {
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" }
                        }
                      }
                    }
                  }
                },
                blockingIssues: { // List of basic info
                  type: "object",
                  properties: {
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: "list_issue_comments",
            description: "List comments for a specific issue",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                issueId: {
                  type: "string",
                  description: "ID of the issue to fetch comments for"
                },
                first: {
                  type: "number",
                  description: "Number of comments to fetch (optional, default: 20)"
                }
              },
              required: ["issueId"]
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      body: { type: "string" },
                      user: { 
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          displayName: { type: "string" }
                        }
                      },
                      createdAt: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "create_comment",
            description: "Create a new comment on an issue",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                issueId: {
                  type: "string",
                  description: "ID of the issue to add a comment to"
                },
                body: {
                  type: "string",
                  description: "Content of the comment"
                }
              },
              required: ["issueId", "body"]
            },
            outputSchema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                comment: { 
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    body: { type: "string" }
                  }
                }
              }
            }
          },
          {
            name: "list_cycles",
            description: "List cycles from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of cycles to fetch (optional, default: 50)"
                }
              }
            },
            outputSchema: { 
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      number: { type: "number" },
                      startsAt: { type: "string", format: "date-time" },
                      endsAt: { type: "string", format: "date-time" },
                      progress: { type: "number"},
                      scopeHistory: { type: "array", items: { type: "number"} },
                      issueCountHistory: { type: "array", items: { type: "number"} },
                      completedScopeHistory: { type: "array", items: { type: "number"} },
                      completedIssueCountHistory: { type: "array", items: { type: "number"} }
                    }
                  }
                }
              }
            }
          },
          {
            name: "get_cycle",
            description: "Get a specific cycle from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the cycle to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                number: { type: "number" },
                startsAt: { type: "string", format: "date-time" },
                endsAt: { type: "string", format: "date-time" },
                progress: { type: "number"},
                scopeHistory: { type: "array", items: { type: "number"} },
                issueCountHistory: { type: "array", items: { type: "number"} },
                completedScopeHistory: { type: "array", items: { type: "number"} },
                completedIssueCountHistory: { type: "array", items: { type: "number"} }
              }
            }
          },
          {
            name: "get_cycle_issues",
            description: "Get issues for a specific cycle from Linear by cycle ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                cycleId: {
                  type: "string",
                  description: "ID of the cycle to fetch issues for"
                },
                first: {
                  type: "number",
                  description: "Number of issues to fetch (optional, default: 50)"
                }
              },
              required: ["cycleId"]
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      status: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "explore_cycle_issue",
            description: "Get full details for a specific issue from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the issue to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string" },
                assignee: { 
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    displayName: { type: "string" }
                  }
                }
              }
            }
          },
          {
            name: "list_projects",
            description: "List projects from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of projects to fetch (optional, default: 50)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      state: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "list_labels",
            description: "List issue labels from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of labels to fetch (optional, default: 50)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      color: { type: "string" },
                      description: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "list_workflow_states",
            description: "List workflow states from Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                first: {
                  type: "number",
                  description: "Number of states to fetch (optional, default: 50)"
                },
                teamId: {
                  type: "string",
                  description: "Filter states by team ID (optional)"
                }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string" },
                      team: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: "update_issue",
            description: "Update an existing issue in Linear",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                issueId: {
                  type: "string",
                  description: "ID of the issue to update"
                },
                title: {
                  type: "string",
                  description: "New title for the issue (optional)"
                },
                description: {
                  type: "string",
                  description: "New description for the issue (optional)"
                },
                projectId: {
                  type: ["string", "null"],
                  description: "New project ID to associate with, or null to remove (optional)"
                },
                stateId: {
                  type: "string",
                  description: "New state ID for the issue (optional)"
                },
                priority: {
                  type: "number",
                  description: "New priority for the issue (0-4, optional)"
                },
                assigneeId: {
                  type: ["string", "null"],
                  description: "New assignee ID, or null to unassign (optional)"
                },
                parentId: {
                  type: ["string", "null"],
                  description: "New parent issue ID, or null to remove parent (optional)"
                },
                addLabelIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of label IDs to add to the issue (optional)"
                },
                removeLabelIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of label IDs to remove from the issue (optional - see implementation notes)"
                }
              },
              required: ["issueId"]
            },
            outputSchema: { // Typically returns the updated issue or success status
              type: "object",
              properties: {
                 success: { type: "boolean" },
                 issue: { 
                   type: "object",
                    properties: { // Reflect potential changes
                      id: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "number" },
                      // Potentially include state, assignee, project, labels if returned by SDK
                    }
                 }
               }
            }
          },
          {
            name: "add_issue_relation",
            description: "Add a relationship (related, blocks, duplicate) between two issues.",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                issueId: {
                  type: "string",
                  description: "ID of the origin issue"
                },
                relatedIssueId: {
                  type: "string",
                  description: "ID of the target issue for the relationship"
                },
                type: {
                  type: "string",
                  enum: ["related", "blocks", "duplicate"],
                  description: "Type of relationship to create"
                }
              },
              required: ["issueId", "relatedIssueId", "type"]
            },
            outputSchema: { // Returns relation info or success
              type: "object",
              properties: {
                success: { type: "boolean" },
                issueRelation: { 
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string" }
                  }
                }
              }
            }
          },
          {
            name: "remove_issue_relation",
            description: "Remove an issue relationship by its ID.",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                relationId: {
                  type: "string",
                  description: "ID of the issue relationship to remove"
                }
              },
              required: ["relationId"]
            },
            outputSchema: {
              type: "object",
              properties: {
                success: { type: "boolean" }
              }
            }
          },
          {
            name: "list_issue_relations",
            description: "List relationships originating from a specific issue.",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                issueId: {
                  type: "string",
                  description: "ID of the issue to list relations for"
                },
                first: {
                  type: "number",
                  description: "Number of relations to fetch (optional, default: 50)"
                }
              },
              required: ["issueId"]
            },
            outputSchema: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      type: { type: "string" },
                      relatedIssue: { // Basic info of the related issue
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: "execute_pipeline",
            description: "Execute a pipeline of Linear operations",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      toolName: { type: "string" },
                      params: { type: "object" }
                    }
                  }
                }
              }
            }
          },
          {
            name: "get_project",
            description: "Get a specific project from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the project to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: { // Reflects full project details from SDK
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                state: { type: "string" },
                // Add other relevant fields returned by SDK like slug, icon, color, members, lead etc.
                slugId: { type: "string" },
                color: { type: "string" },
                startDate: { type: ["string", "null"], format: "date"},
                targetDate: { type: ["string", "null"], format: "date"}
              }
            }
          },
          {
            name: "get_label",
            description: "Get a specific issue label from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the label to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                color: { type: "string" },
                description: { type: ["string", "null"] }
                // Add other fields like teamId, creatorId if returned
              }
            }
          },
          {
            name: "get_workflow_state",
            description: "Get a specific workflow state from Linear by ID",
            version: "1.0.0",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID of the workflow state to fetch"
                }
              },
              required: ["id"]
            },
            outputSchema: { 
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                type: { type: "string" },
                description: { type: ["string", "null"] },
                position: { type: "number" },
                team: { // Full team details if returned by SDK
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    key: { type: "string" }
                    // Add other team fields if needed
                  }
                }
              }
            }
          }
        ]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        try {
          let result;
          
          if (request.params.name === "execute_pipeline") {
            result = await this.pipelineProcessor.executePipeline(request.params.arguments);
          } else {
            result = await this.executeTool(request.params.name, request.params.arguments);
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          const mcpError: MCPError = new Error(error instanceof Error ? error.message : String(error));
          mcpError.code = error instanceof Error && 'code' in error 
            ? (error as any).code 
            : 'TOOL_ERROR';
          mcpError.retryable = mcpError.code === 'RATE_LIMIT' || mcpError.code === 'NETWORK_ERROR';
          mcpError.details = error;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                code: mcpError.code,
                message: mcpError.message,
                details: mcpError.details,
                retryable: mcpError.retryable,
                suggestions: this.getSuggestionsForError(mcpError)
              }, null, 2)
            }],
            isError: true
          };
        }
      }
    );
  }

  private getSuggestionsForError(error: MCPError): string[] {
    switch (error.code) {
      case 'RATE_LIMIT':
        return ['Wait and retry later', 'Reduce request frequency'];
      case 'AUTHENTICATION_ERROR':
        return ['Check API key', 'Verify Linear authentication'];
      case 'NETWORK_ERROR':
        return ['Check network connection', 'Verify Linear API status'];
      default:
        return ['Check input parameters', 'Consult Linear API documentation'];
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Enhanced Linear MCP server running on stdio");
    
    // Log initial metrics state
    console.error("[MCP Metrics] Server started at:", new Date().toISOString());
  }
}

const server = new EnhancedLinearServer();
server.run().catch(console.error);