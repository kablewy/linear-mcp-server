# Linear MCP Server

Model Context Protocol server implementation for Linear issue tracking and project management. This server is used to create, update, and manage issues, cycles, projects, and other Linear resources.

## Features

- MCP-compliant server using official SDK
- Seamless integration with Linear API
- Type-safe implementation with TypeScript and Zod schemas
- Comprehensive issue management and tracking
- User, team, and project management
- Cycle and workflow state handling
- Issue relations and dependencies
- Comments and collaboration tools
- Pipeline execution and multi-step workflows
- Advanced error handling and metrics collection
- Extensible tool and pipeline architecture

## Tools

### Issue Management

- **list_issues**
  - List issues from Linear
  - Inputs:
    - `teamId` (string, optional): ID of the team to list issues from
    - `first` (number, optional): Number of issues to fetch (default: 50)
    - `projectId` (string, optional): Filter issues by project ID
    - `labelId` (string, optional): Filter issues by label ID
    - `stateId` (string, optional): Filter issues by state ID
    - `priority` (number, optional): Filter issues by priority (0-4)
    - `assigneeId` (string, optional): Filter issues by assignee ID
  - Returns: Array of Linear issues with details

- **create_issue**
  - Create a new issue in Linear
  - Inputs:
    - `title` (string): Title of the issue
    - `teamId` (string): ID of the team
    - `description` (string, optional): Description of the issue
    - `priority` (number, optional): Priority of the issue
    - `assigneeId` (string, optional): ID of the assignee
  - Returns: Created issue details

- **get_issue**
  - Get a specific issue with detailed information
  - Inputs:
    - `id` (string): ID of the issue
  - Returns: Issue details

- **update_issue**
  - Update an existing issue
  - Inputs:
    - `issueId` (string): ID of the issue to update
    - `title` (string, optional): New title
    - `description` (string, optional): New description
    - `projectId` (string, optional): New project ID (or null to remove)
    - `stateId` (string, optional): New state ID
    - `priority` (number, optional): New priority
    - `assigneeId` (string, optional): New assignee ID (or null to unassign)
    - `parentId` (string, optional): New parent issue ID (or null to remove)
    - `addLabelIds` (string[], optional): Label IDs to add to the issue
    - `removeLabelIds` (string[], optional): Label IDs to remove from the issue
  - Returns: Updated issue details

### Issue Relations

- **add_issue_relation**
  - Create a relation between two issues
  - Inputs:
    - `issueId` (string): ID of the source issue
    - `relatedIssueId` (string): ID of the target issue
    - `type` (string): Relation type ('related', 'blocks', or 'duplicate')
  - Returns: Created relation details

- **remove_issue_relation**
  - Remove a relation between issues
  - Inputs:
    - `relationId` (string): ID of the relation to remove
  - Returns: Operation result

- **list_issue_relations**
  - List relations for a specific issue
  - Inputs:
    - `issueId` (string): ID of the issue
    - `first` (number, optional): Number of relations to fetch
  - Returns: Array of issue relations

### Comments

- **list_issue_comments**
  - List comments for a specific issue
  - Inputs:
    - `issueId` (string): ID of the issue
    - `first` (number, optional): Number of comments to fetch
  - Returns: Array of comments

- **create_comment**
  - Add a comment to an issue
  - Inputs:
    - `issueId` (string): ID of the issue
    - `body` (string): Comment text
  - Returns: Created comment details

### User & Team Management

- **list_users**
  - List users from Linear
  - Inputs:
    - `first` (number, optional): Number of users to fetch (default: 50)
    - `includeArchived` (boolean, optional): Whether to include archived users (default: false)
  - Returns: Array of users with their details

- **get_user**
  - Get details of a specific user
  - Inputs:
    - `id` (string): ID of the user to fetch
  - Returns: User details including name, display name, email, and status

- **list_teams**
  - List teams from Linear
  - Inputs:
    - `first` (number, optional): Number of teams to fetch (default: 50)
    - `includeArchived` (boolean, optional): Whether to include archived teams (default: false)
  - Returns: Array of teams with their details

- **get_team**
  - Get details of a specific team
  - Inputs:
    - `id` (string): ID of the team to fetch
  - Returns: Team details including name, description, and key

### Cycles

- **list_cycles**
  - List cycles from Linear
  - Inputs:
    - `first` (number, optional): Number of cycles to fetch
  - Returns: Array of cycles with their details

- **get_cycle**
  - Get details of a specific cycle
  - Inputs:
    - `id` (string): ID of the cycle to fetch
  - Returns: Cycle details

- **get_cycle_issues**
  - Get issues for a specific cycle
  - Inputs:
    - `cycleId` (string): ID of the cycle
    - `first` (number, optional): Number of issues to fetch
  - Returns: Array of issues in the cycle

- **explore_cycle_issue**
  - Get detailed information about an issue in a cycle
  - Inputs:
    - `id` (string): ID of the issue to explore
  - Returns: Detailed issue information

### Projects

- **list_projects**
  - List projects from Linear
  - Inputs:
    - `first` (number, optional): Number of projects to fetch
  - Returns: Array of projects with their details

- **get_project**
  - Get details of a specific project
  - Inputs:
    - `id` (string): ID of the project to fetch
  - Returns: Project details

### Labels

- **list_labels**
  - List issue labels from Linear
  - Inputs:
    - `first` (number, optional): Number of labels to fetch
  - Returns: Array of labels with their details

- **get_label**
  - Get details of a specific label
  - Inputs:
    - `id` (string): ID of the label to fetch
  - Returns: Label details

### Workflow States

- **list_workflow_states**
  - List workflow states from Linear
  - Inputs:
    - `first` (number, optional): Number of states to fetch
    - `teamId` (string, optional): Filter states by team ID
  - Returns: Array of workflow states with their details

- **get_workflow_state**
  - Get details of a specific workflow state
  - Inputs:
    - `id` (string): ID of the workflow state to fetch
  - Returns: Workflow state details

### Pipeline Execution

- **execute_pipeline**
  - Execute a series of tool steps conditionally and with data transformation.
  - Inputs:
    - `steps` (array): List of steps, each with `toolName`, `params`, optional `condition`, and optional `transform` function.
    - `context` (object, optional): Execution context (requestId, timestamp, timeout, retryCount, etc).
  - Returns: Array of results from each pipeline step.

#### Example Pipeline Definition
```json
{
  "steps": [
    { "toolName": "list_issues", "params": { "first": 1 } },
    { "toolName": "create_issue", "params": {}, "condition": "results => results && results.length > 0", "transform": "results => ({ title: 'Follow-up', teamId: results[0].teamId })" }
  ],
  "context": { "requestId": "abc123" }
}
```

### Error Handling

All tools return errors in a standard format:
- `code` (string): Error code
- `message` (string): Error message
- `retryable` (boolean): Whether the error is retryable
- `details` (object, optional): Additional details
- `suggestions` (array, optional): Suggestions for resolution

### Metrics & Monitoring

- Tracks error rates and average request durations per tool
- Periodic reporting to stderr
- Metrics can be reset and inspected programmatically

### Type Safety & Extensibility

- All tool schemas are defined with Zod for runtime validation
- Easy to add new tools by extending schemas and handlers
- Pipelines can be composed with custom logic using `condition` and `transform` functions

### Usage Example: Listing Issues

```bash
curl -X POST http://localhost:3000/tool/list_issues \
  -H 'Content-Type: application/json' \
  -d '{ "teamId": "your-team-id", "first": 10 }'
```

### Usage Example: Executing a Pipeline

```json
{
  "steps": [
    { "toolName": "list_issues", "params": { "first": 2 } },
    { "toolName": "create_issue", "params": { "title": "Automated follow-up", "teamId": "team123" } }
  ]
}
```

---

For more details, see the [Model Context Protocol Introduction](https://modelcontextprotocol.io/introduction).
  - Inputs:
    - `id` (string): ID of the issue to fetch
  - Returns: Issue details including title, description, status, and assignee information

- **list_issue_comments**
  - List comments for a specific issue
  - Inputs:
    - `issueId` (string): ID of the issue to fetch comments for
    - `first` (number, optional): Number of comments to fetch (default: 20)
  - Returns: Array of comments with their content and author information

- **create_comment**
  - Create a new comment on an issue
  - Inputs:
    - `issueId` (string): ID of the issue to add a comment to
    - `body` (string): Content of the comment
  - Returns: Created comment details

- **execute_pipeline**
  - Execute a pipeline of Linear operations
  - Input:
    - `steps` (array): Array of pipeline steps, each with:
      - `toolName` (string): Name of the tool to execute
      - `params` (object): Parameters for the tool
  - Returns: Results from pipeline execution

## Setup

1. Get a Linear API key:
   - Log in to Linear at https://linear.app
   - Go to Settings > API > Personal API keys
   - Click 'Create Key'
   - Give your key a name (e.g., 'MCP Server')
   - Copy the generated API key (it will only be shown once)
   - Store it securely for use in the environment variables


2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage with Claude Desktop

### Node Version
```json
{
  "mcpServers": {
    "linear": {
      "command": "node",
      "args": [
        "path/to/linear-mcp-server/build/index.js"
      ],
      "env": {
        "LINEAR_API_KEY": "<YOUR_LINEAR_API_KEY>"
      }
    }
  }
}
```

### Docker Version
```json
{
  "mcpServers": {
    "linear": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "LINEAR_API_KEY",
        "mcp/linear"
      ],
      "env": {
        "LINEAR_API_KEY": "<YOUR_LINEAR_API_KEY>"
      }
    }
  }
}
```

## Docker Build

To build the Docker image:

```bash
docker build -t mcp/linear -f src/linear/Dockerfile .
```

Note: 
1. Replace `<YOUR_LINEAR_API_KEY>` with your Linear API key
2. For local development, you can use the Node version
3. For production deployments, use the Docker version