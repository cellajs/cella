// @ts-nocheck
import { z } from 'zod';
import type { Prisma } from './prismaClient';
import { type TableSchema, DbSchema, Relation, ElectricClient, type HKT } from 'electric-sql/client/model';
import migrations from './migrations';

/////////////////////////////////////////
// HELPER FUNCTIONS
/////////////////////////////////////////


/////////////////////////////////////////
// ENUMS
/////////////////////////////////////////

export const LabelsScalarFieldEnumSchema = z.enum(['id','name','color','project_id']);

export const ProjectsScalarFieldEnumSchema = z.enum(['id','slug','name','color','workspace_id','created_at','created_by','modified_at','modified_by']);

export const QueryModeSchema = z.enum(['default','insensitive']);

export const SortOrderSchema = z.enum(['asc','desc']);

export const Task_labelsScalarFieldEnumSchema = z.enum(['task_id','label_id']);

export const Task_usersScalarFieldEnumSchema = z.enum(['task_id','user_id','role']);

export const TasksScalarFieldEnumSchema = z.enum(['id','slug','markdown','summary','type','impact','status','project_id','created_at','created_by','assigned_by','assigned_at','modified_at','modified_by','sort_order']);

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted','ReadCommitted','RepeatableRead','Serializable']);
/////////////////////////////////////////
// MODELS
/////////////////////////////////////////

/////////////////////////////////////////
// LABELS SCHEMA
/////////////////////////////////////////

export const LabelsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  project_id: z.string().uuid(),
})

export type Labels = z.infer<typeof LabelsSchema>

/////////////////////////////////////////
// PROJECTS SCHEMA
/////////////////////////////////////////

export const ProjectsSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().nullable(),
  modified_by: z.string().nullable(),
})

export type Projects = z.infer<typeof ProjectsSchema>

/////////////////////////////////////////
// TASK LABELS SCHEMA
/////////////////////////////////////////

export const Task_labelsSchema = z.object({
  task_id: z.string().uuid(),
  label_id: z.string().uuid(),
})

export type Task_labels = z.infer<typeof Task_labelsSchema>

/////////////////////////////////////////
// TASK USERS SCHEMA
/////////////////////////////////////////

export const Task_usersSchema = z.object({
  task_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.string(),
})

export type Task_users = z.infer<typeof Task_usersSchema>

/////////////////////////////////////////
// TASKS SCHEMA
/////////////////////////////////////////

export const TasksSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  markdown: z.string().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string().uuid(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().nullable(),
  assigned_at: z.coerce.date().nullable(),
  modified_at: z.coerce.date().nullable(),
  modified_by: z.string().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).nullable(),
})

export type Tasks = z.infer<typeof TasksSchema>

/////////////////////////////////////////
// SELECT & INCLUDE
/////////////////////////////////////////

// LABELS
//------------------------------------------------------

export const LabelsIncludeSchema: z.ZodType<Prisma.LabelsInclude> = z.object({
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
  task_labels: z.union([z.boolean(),z.lazy(() => Task_labelsFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => LabelsCountOutputTypeArgsSchema)]).optional(),
}).strict()

export const LabelsArgsSchema: z.ZodType<Prisma.LabelsArgs> = z.object({
  select: z.lazy(() => LabelsSelectSchema).optional(),
  include: z.lazy(() => LabelsIncludeSchema).optional(),
}).strict();

export const LabelsCountOutputTypeArgsSchema: z.ZodType<Prisma.LabelsCountOutputTypeArgs> = z.object({
  select: z.lazy(() => LabelsCountOutputTypeSelectSchema).nullish(),
}).strict();

export const LabelsCountOutputTypeSelectSchema: z.ZodType<Prisma.LabelsCountOutputTypeSelect> = z.object({
  task_labels: z.boolean().optional(),
}).strict();

export const LabelsSelectSchema: z.ZodType<Prisma.LabelsSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  color: z.boolean().optional(),
  project_id: z.boolean().optional(),
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
  task_labels: z.union([z.boolean(),z.lazy(() => Task_labelsFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => LabelsCountOutputTypeArgsSchema)]).optional(),
}).strict()

// PROJECTS
//------------------------------------------------------

export const ProjectsIncludeSchema: z.ZodType<Prisma.ProjectsInclude> = z.object({
  labels: z.union([z.boolean(),z.lazy(() => LabelsFindManyArgsSchema)]).optional(),
  tasks: z.union([z.boolean(),z.lazy(() => TasksFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => ProjectsCountOutputTypeArgsSchema)]).optional(),
}).strict()

export const ProjectsArgsSchema: z.ZodType<Prisma.ProjectsArgs> = z.object({
  select: z.lazy(() => ProjectsSelectSchema).optional(),
  include: z.lazy(() => ProjectsIncludeSchema).optional(),
}).strict();

export const ProjectsCountOutputTypeArgsSchema: z.ZodType<Prisma.ProjectsCountOutputTypeArgs> = z.object({
  select: z.lazy(() => ProjectsCountOutputTypeSelectSchema).nullish(),
}).strict();

export const ProjectsCountOutputTypeSelectSchema: z.ZodType<Prisma.ProjectsCountOutputTypeSelect> = z.object({
  labels: z.boolean().optional(),
  tasks: z.boolean().optional(),
}).strict();

export const ProjectsSelectSchema: z.ZodType<Prisma.ProjectsSelect> = z.object({
  id: z.boolean().optional(),
  slug: z.boolean().optional(),
  name: z.boolean().optional(),
  color: z.boolean().optional(),
  workspace_id: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
  labels: z.union([z.boolean(),z.lazy(() => LabelsFindManyArgsSchema)]).optional(),
  tasks: z.union([z.boolean(),z.lazy(() => TasksFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => ProjectsCountOutputTypeArgsSchema)]).optional(),
}).strict()

// TASK LABELS
//------------------------------------------------------

export const Task_labelsIncludeSchema: z.ZodType<Prisma.Task_labelsInclude> = z.object({
  labels: z.union([z.boolean(),z.lazy(() => LabelsArgsSchema)]).optional(),
  tasks: z.union([z.boolean(),z.lazy(() => TasksArgsSchema)]).optional(),
}).strict()

export const Task_labelsArgsSchema: z.ZodType<Prisma.Task_labelsArgs> = z.object({
  select: z.lazy(() => Task_labelsSelectSchema).optional(),
  include: z.lazy(() => Task_labelsIncludeSchema).optional(),
}).strict();

export const Task_labelsSelectSchema: z.ZodType<Prisma.Task_labelsSelect> = z.object({
  task_id: z.boolean().optional(),
  label_id: z.boolean().optional(),
  labels: z.union([z.boolean(),z.lazy(() => LabelsArgsSchema)]).optional(),
  tasks: z.union([z.boolean(),z.lazy(() => TasksArgsSchema)]).optional(),
}).strict()

// TASK USERS
//------------------------------------------------------

export const Task_usersIncludeSchema: z.ZodType<Prisma.Task_usersInclude> = z.object({
  tasks: z.union([z.boolean(),z.lazy(() => TasksArgsSchema)]).optional(),
}).strict()

export const Task_usersArgsSchema: z.ZodType<Prisma.Task_usersArgs> = z.object({
  select: z.lazy(() => Task_usersSelectSchema).optional(),
  include: z.lazy(() => Task_usersIncludeSchema).optional(),
}).strict();

export const Task_usersSelectSchema: z.ZodType<Prisma.Task_usersSelect> = z.object({
  task_id: z.boolean().optional(),
  user_id: z.boolean().optional(),
  role: z.boolean().optional(),
  tasks: z.union([z.boolean(),z.lazy(() => TasksArgsSchema)]).optional(),
}).strict()

// TASKS
//------------------------------------------------------

export const TasksIncludeSchema: z.ZodType<Prisma.TasksInclude> = z.object({
  task_labels: z.union([z.boolean(),z.lazy(() => Task_labelsFindManyArgsSchema)]).optional(),
  task_users: z.union([z.boolean(),z.lazy(() => Task_usersFindManyArgsSchema)]).optional(),
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => TasksCountOutputTypeArgsSchema)]).optional(),
}).strict()

export const TasksArgsSchema: z.ZodType<Prisma.TasksArgs> = z.object({
  select: z.lazy(() => TasksSelectSchema).optional(),
  include: z.lazy(() => TasksIncludeSchema).optional(),
}).strict();

export const TasksCountOutputTypeArgsSchema: z.ZodType<Prisma.TasksCountOutputTypeArgs> = z.object({
  select: z.lazy(() => TasksCountOutputTypeSelectSchema).nullish(),
}).strict();

export const TasksCountOutputTypeSelectSchema: z.ZodType<Prisma.TasksCountOutputTypeSelect> = z.object({
  task_labels: z.boolean().optional(),
  task_users: z.boolean().optional(),
}).strict();

export const TasksSelectSchema: z.ZodType<Prisma.TasksSelect> = z.object({
  id: z.boolean().optional(),
  slug: z.boolean().optional(),
  markdown: z.boolean().optional(),
  summary: z.boolean().optional(),
  type: z.boolean().optional(),
  impact: z.boolean().optional(),
  status: z.boolean().optional(),
  project_id: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  assigned_by: z.boolean().optional(),
  assigned_at: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
  sort_order: z.boolean().optional(),
  task_labels: z.union([z.boolean(),z.lazy(() => Task_labelsFindManyArgsSchema)]).optional(),
  task_users: z.union([z.boolean(),z.lazy(() => Task_usersFindManyArgsSchema)]).optional(),
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => TasksCountOutputTypeArgsSchema)]).optional(),
}).strict()


/////////////////////////////////////////
// INPUT TYPES
/////////////////////////////////////////

export const LabelsWhereInputSchema: z.ZodType<Prisma.LabelsWhereInput> = z.object({
  AND: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  projects: z.union([ z.lazy(() => ProjectsRelationFilterSchema),z.lazy(() => ProjectsWhereInputSchema) ]).optional(),
  task_labels: z.lazy(() => Task_labelsListRelationFilterSchema).optional()
}).strict();

export const LabelsOrderByWithRelationInputSchema: z.ZodType<Prisma.LabelsOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  projects: z.lazy(() => ProjectsOrderByWithRelationInputSchema).optional(),
  task_labels: z.lazy(() => Task_labelsOrderByRelationAggregateInputSchema).optional()
}).strict();

export const LabelsWhereUniqueInputSchema: z.ZodType<Prisma.LabelsWhereUniqueInput> = z.object({
  id: z.string().uuid().optional()
}).strict();

export const LabelsOrderByWithAggregationInputSchema: z.ZodType<Prisma.LabelsOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => LabelsCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => LabelsMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => LabelsMinOrderByAggregateInputSchema).optional()
}).strict();

export const LabelsScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.LabelsScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema),z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema),z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
}).strict();

export const ProjectsWhereInputSchema: z.ZodType<Prisma.ProjectsWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ProjectsWhereInputSchema),z.lazy(() => ProjectsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProjectsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProjectsWhereInputSchema),z.lazy(() => ProjectsWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  workspace_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  labels: z.lazy(() => LabelsListRelationFilterSchema).optional(),
  tasks: z.lazy(() => TasksListRelationFilterSchema).optional()
}).strict();

export const ProjectsOrderByWithRelationInputSchema: z.ZodType<Prisma.ProjectsOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  workspace_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  labels: z.lazy(() => LabelsOrderByRelationAggregateInputSchema).optional(),
  tasks: z.lazy(() => TasksOrderByRelationAggregateInputSchema).optional()
}).strict();

export const ProjectsWhereUniqueInputSchema: z.ZodType<Prisma.ProjectsWhereUniqueInput> = z.object({
  id: z.string().uuid().optional()
}).strict();

export const ProjectsOrderByWithAggregationInputSchema: z.ZodType<Prisma.ProjectsOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  workspace_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ProjectsCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ProjectsMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ProjectsMinOrderByAggregateInputSchema).optional()
}).strict();

export const ProjectsScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ProjectsScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ProjectsScalarWhereWithAggregatesInputSchema),z.lazy(() => ProjectsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProjectsScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProjectsScalarWhereWithAggregatesInputSchema),z.lazy(() => ProjectsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  workspace_id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const Task_labelsWhereInputSchema: z.ZodType<Prisma.Task_labelsWhereInput> = z.object({
  AND: z.union([ z.lazy(() => Task_labelsWhereInputSchema),z.lazy(() => Task_labelsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_labelsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_labelsWhereInputSchema),z.lazy(() => Task_labelsWhereInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  label_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  labels: z.union([ z.lazy(() => LabelsRelationFilterSchema),z.lazy(() => LabelsWhereInputSchema) ]).optional(),
  tasks: z.union([ z.lazy(() => TasksRelationFilterSchema),z.lazy(() => TasksWhereInputSchema) ]).optional(),
}).strict();

export const Task_labelsOrderByWithRelationInputSchema: z.ZodType<Prisma.Task_labelsOrderByWithRelationInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  label_id: z.lazy(() => SortOrderSchema).optional(),
  labels: z.lazy(() => LabelsOrderByWithRelationInputSchema).optional(),
  tasks: z.lazy(() => TasksOrderByWithRelationInputSchema).optional()
}).strict();

export const Task_labelsWhereUniqueInputSchema: z.ZodType<Prisma.Task_labelsWhereUniqueInput> = z.object({
  label_id_task_id: z.lazy(() => Task_labelsLabel_idTask_idCompoundUniqueInputSchema).optional()
}).strict();

export const Task_labelsOrderByWithAggregationInputSchema: z.ZodType<Prisma.Task_labelsOrderByWithAggregationInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  label_id: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => Task_labelsCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => Task_labelsMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => Task_labelsMinOrderByAggregateInputSchema).optional()
}).strict();

export const Task_labelsScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.Task_labelsScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => Task_labelsScalarWhereWithAggregatesInputSchema),z.lazy(() => Task_labelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_labelsScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_labelsScalarWhereWithAggregatesInputSchema),z.lazy(() => Task_labelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  label_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
}).strict();

export const Task_usersWhereInputSchema: z.ZodType<Prisma.Task_usersWhereInput> = z.object({
  AND: z.union([ z.lazy(() => Task_usersWhereInputSchema),z.lazy(() => Task_usersWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_usersWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_usersWhereInputSchema),z.lazy(() => Task_usersWhereInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  user_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  tasks: z.union([ z.lazy(() => TasksRelationFilterSchema),z.lazy(() => TasksWhereInputSchema) ]).optional(),
}).strict();

export const Task_usersOrderByWithRelationInputSchema: z.ZodType<Prisma.Task_usersOrderByWithRelationInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  user_id: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  tasks: z.lazy(() => TasksOrderByWithRelationInputSchema).optional()
}).strict();

export const Task_usersWhereUniqueInputSchema: z.ZodType<Prisma.Task_usersWhereUniqueInput> = z.object({
  user_id_task_id: z.lazy(() => Task_usersUser_idTask_idCompoundUniqueInputSchema).optional()
}).strict();

export const Task_usersOrderByWithAggregationInputSchema: z.ZodType<Prisma.Task_usersOrderByWithAggregationInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  user_id: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => Task_usersCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => Task_usersMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => Task_usersMinOrderByAggregateInputSchema).optional()
}).strict();

export const Task_usersScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.Task_usersScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => Task_usersScalarWhereWithAggregatesInputSchema),z.lazy(() => Task_usersScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_usersScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_usersScalarWhereWithAggregatesInputSchema),z.lazy(() => Task_usersScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  user_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
}).strict();

export const TasksWhereInputSchema: z.ZodType<Prisma.TasksWhereInput> = z.object({
  AND: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntFilterSchema),z.number() ]).optional(),
  project_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsListRelationFilterSchema).optional(),
  task_users: z.lazy(() => Task_usersListRelationFilterSchema).optional(),
  projects: z.union([ z.lazy(() => ProjectsRelationFilterSchema),z.lazy(() => ProjectsWhereInputSchema) ]).optional(),
}).strict();

export const TasksOrderByWithRelationInputSchema: z.ZodType<Prisma.TasksOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_at: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional(),
  task_labels: z.lazy(() => Task_labelsOrderByRelationAggregateInputSchema).optional(),
  task_users: z.lazy(() => Task_usersOrderByRelationAggregateInputSchema).optional(),
  projects: z.lazy(() => ProjectsOrderByWithRelationInputSchema).optional()
}).strict();

export const TasksWhereUniqueInputSchema: z.ZodType<Prisma.TasksWhereUniqueInput> = z.object({
  id: z.string().uuid().optional()
}).strict();

export const TasksOrderByWithAggregationInputSchema: z.ZodType<Prisma.TasksOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_at: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => TasksCountOrderByAggregateInputSchema).optional(),
  _avg: z.lazy(() => TasksAvgOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => TasksMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => TasksMinOrderByAggregateInputSchema).optional(),
  _sum: z.lazy(() => TasksSumOrderByAggregateInputSchema).optional()
}).strict();

export const TasksScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.TasksScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => TasksScalarWhereWithAggregatesInputSchema),z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksScalarWhereWithAggregatesInputSchema),z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableWithAggregatesFilterSchema),z.number() ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntWithAggregatesFilterSchema),z.number() ]).optional(),
  project_id: z.union([ z.lazy(() => UuidWithAggregatesFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableWithAggregatesFilterSchema),z.number() ]).optional().nullable(),
}).strict();

export const LabelsCreateInputSchema: z.ZodType<Prisma.LabelsCreateInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutLabelsInputSchema),
  task_labels: z.lazy(() => Task_labelsCreateNestedManyWithoutLabelsInputSchema).optional()
}).strict();

export const LabelsUncheckedCreateInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string().uuid(),
  task_labels: z.lazy(() => Task_labelsUncheckedCreateNestedManyWithoutLabelsInputSchema).optional()
}).strict();

export const LabelsUpdateInputSchema: z.ZodType<Prisma.LabelsUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutLabelsNestedInputSchema).optional(),
  task_labels: z.lazy(() => Task_labelsUpdateManyWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsUncheckedUpdateInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  task_labels: z.lazy(() => Task_labelsUncheckedUpdateManyWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsCreateManyInputSchema: z.ZodType<Prisma.LabelsCreateManyInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string().uuid()
}).strict();

export const LabelsUpdateManyMutationInputSchema: z.ZodType<Prisma.LabelsUpdateManyMutationInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const LabelsUncheckedUpdateManyInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ProjectsCreateInputSchema: z.ZodType<Prisma.ProjectsCreateInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  labels: z.lazy(() => LabelsCreateNestedManyWithoutProjectsInputSchema).optional(),
  tasks: z.lazy(() => TasksCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUncheckedCreateInputSchema: z.ZodType<Prisma.ProjectsUncheckedCreateInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  labels: z.lazy(() => LabelsUncheckedCreateNestedManyWithoutProjectsInputSchema).optional(),
  tasks: z.lazy(() => TasksUncheckedCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUpdateInputSchema: z.ZodType<Prisma.ProjectsUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labels: z.lazy(() => LabelsUpdateManyWithoutProjectsNestedInputSchema).optional(),
  tasks: z.lazy(() => TasksUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsUncheckedUpdateInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labels: z.lazy(() => LabelsUncheckedUpdateManyWithoutProjectsNestedInputSchema).optional(),
  tasks: z.lazy(() => TasksUncheckedUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsCreateManyInputSchema: z.ZodType<Prisma.ProjectsCreateManyInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const ProjectsUpdateManyMutationInputSchema: z.ZodType<Prisma.ProjectsUpdateManyMutationInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ProjectsUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const Task_labelsCreateInputSchema: z.ZodType<Prisma.Task_labelsCreateInput> = z.object({
  labels: z.lazy(() => LabelsCreateNestedOneWithoutTask_labelsInputSchema),
  tasks: z.lazy(() => TasksCreateNestedOneWithoutTask_labelsInputSchema)
}).strict();

export const Task_labelsUncheckedCreateInputSchema: z.ZodType<Prisma.Task_labelsUncheckedCreateInput> = z.object({
  task_id: z.string().uuid(),
  label_id: z.string().uuid()
}).strict();

export const Task_labelsUpdateInputSchema: z.ZodType<Prisma.Task_labelsUpdateInput> = z.object({
  labels: z.lazy(() => LabelsUpdateOneRequiredWithoutTask_labelsNestedInputSchema).optional(),
  tasks: z.lazy(() => TasksUpdateOneRequiredWithoutTask_labelsNestedInputSchema).optional()
}).strict();

export const Task_labelsUncheckedUpdateInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateInput> = z.object({
  task_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  label_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_labelsCreateManyInputSchema: z.ZodType<Prisma.Task_labelsCreateManyInput> = z.object({
  task_id: z.string().uuid(),
  label_id: z.string().uuid()
}).strict();

export const Task_labelsUpdateManyMutationInputSchema: z.ZodType<Prisma.Task_labelsUpdateManyMutationInput> = z.object({
}).strict();

export const Task_labelsUncheckedUpdateManyInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateManyInput> = z.object({
  task_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  label_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersCreateInputSchema: z.ZodType<Prisma.Task_usersCreateInput> = z.object({
  user_id: z.string().uuid(),
  role: z.string(),
  tasks: z.lazy(() => TasksCreateNestedOneWithoutTask_usersInputSchema)
}).strict();

export const Task_usersUncheckedCreateInputSchema: z.ZodType<Prisma.Task_usersUncheckedCreateInput> = z.object({
  task_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.string()
}).strict();

export const Task_usersUpdateInputSchema: z.ZodType<Prisma.Task_usersUpdateInput> = z.object({
  user_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  tasks: z.lazy(() => TasksUpdateOneRequiredWithoutTask_usersNestedInputSchema).optional()
}).strict();

export const Task_usersUncheckedUpdateInputSchema: z.ZodType<Prisma.Task_usersUncheckedUpdateInput> = z.object({
  task_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  user_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersCreateManyInputSchema: z.ZodType<Prisma.Task_usersCreateManyInput> = z.object({
  task_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.string()
}).strict();

export const Task_usersUpdateManyMutationInputSchema: z.ZodType<Prisma.Task_usersUpdateManyMutationInput> = z.object({
  user_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersUncheckedUpdateManyInputSchema: z.ZodType<Prisma.Task_usersUncheckedUpdateManyInput> = z.object({
  task_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  user_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const TasksCreateInputSchema: z.ZodType<Prisma.TasksCreateInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsCreateNestedManyWithoutTasksInputSchema).optional(),
  task_users: z.lazy(() => Task_usersCreateNestedManyWithoutTasksInputSchema).optional(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutTasksInputSchema)
}).strict();

export const TasksUncheckedCreateInputSchema: z.ZodType<Prisma.TasksUncheckedCreateInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string().uuid(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedCreateNestedManyWithoutTasksInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUncheckedCreateNestedManyWithoutTasksInputSchema).optional()
}).strict();

export const TasksUpdateInputSchema: z.ZodType<Prisma.TasksUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUpdateManyWithoutTasksNestedInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUpdateManyWithoutTasksNestedInputSchema).optional(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedUpdateManyWithoutTasksNestedInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUncheckedUpdateManyWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksCreateManyInputSchema: z.ZodType<Prisma.TasksCreateManyInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string().uuid(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable()
}).strict();

export const TasksUpdateManyMutationInputSchema: z.ZodType<Prisma.TasksUpdateManyMutationInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateManyInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const UuidFilterSchema: z.ZodType<Prisma.UuidFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedUuidFilterSchema) ]).optional(),
}).strict();

export const StringFilterSchema: z.ZodType<Prisma.StringFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const StringNullableFilterSchema: z.ZodType<Prisma.StringNullableFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const ProjectsRelationFilterSchema: z.ZodType<Prisma.ProjectsRelationFilter> = z.object({
  is: z.lazy(() => ProjectsWhereInputSchema).optional(),
  isNot: z.lazy(() => ProjectsWhereInputSchema).optional()
}).strict();

export const Task_labelsListRelationFilterSchema: z.ZodType<Prisma.Task_labelsListRelationFilter> = z.object({
  every: z.lazy(() => Task_labelsWhereInputSchema).optional(),
  some: z.lazy(() => Task_labelsWhereInputSchema).optional(),
  none: z.lazy(() => Task_labelsWhereInputSchema).optional()
}).strict();

export const Task_labelsOrderByRelationAggregateInputSchema: z.ZodType<Prisma.Task_labelsOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const LabelsCountOrderByAggregateInputSchema: z.ZodType<Prisma.LabelsCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const LabelsMaxOrderByAggregateInputSchema: z.ZodType<Prisma.LabelsMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const LabelsMinOrderByAggregateInputSchema: z.ZodType<Prisma.LabelsMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const UuidWithAggregatesFilterSchema: z.ZodType<Prisma.UuidWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedUuidWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const StringWithAggregatesFilterSchema: z.ZodType<Prisma.StringWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const StringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.StringNullableWithAggregatesFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional()
}).strict();

export const DateTimeFilterSchema: z.ZodType<Prisma.DateTimeFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const DateTimeNullableFilterSchema: z.ZodType<Prisma.DateTimeNullableFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const LabelsListRelationFilterSchema: z.ZodType<Prisma.LabelsListRelationFilter> = z.object({
  every: z.lazy(() => LabelsWhereInputSchema).optional(),
  some: z.lazy(() => LabelsWhereInputSchema).optional(),
  none: z.lazy(() => LabelsWhereInputSchema).optional()
}).strict();

export const TasksListRelationFilterSchema: z.ZodType<Prisma.TasksListRelationFilter> = z.object({
  every: z.lazy(() => TasksWhereInputSchema).optional(),
  some: z.lazy(() => TasksWhereInputSchema).optional(),
  none: z.lazy(() => TasksWhereInputSchema).optional()
}).strict();

export const LabelsOrderByRelationAggregateInputSchema: z.ZodType<Prisma.LabelsOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksOrderByRelationAggregateInputSchema: z.ZodType<Prisma.TasksOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsCountOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  workspace_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  workspace_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsMinOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  workspace_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const DateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional()
}).strict();

export const DateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional()
}).strict();

export const LabelsRelationFilterSchema: z.ZodType<Prisma.LabelsRelationFilter> = z.object({
  is: z.lazy(() => LabelsWhereInputSchema).optional(),
  isNot: z.lazy(() => LabelsWhereInputSchema).optional()
}).strict();

export const TasksRelationFilterSchema: z.ZodType<Prisma.TasksRelationFilter> = z.object({
  is: z.lazy(() => TasksWhereInputSchema).optional(),
  isNot: z.lazy(() => TasksWhereInputSchema).optional()
}).strict();

export const Task_labelsLabel_idTask_idCompoundUniqueInputSchema: z.ZodType<Prisma.Task_labelsLabel_idTask_idCompoundUniqueInput> = z.object({
  label_id: z.string(),
  task_id: z.string()
}).strict();

export const Task_labelsCountOrderByAggregateInputSchema: z.ZodType<Prisma.Task_labelsCountOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  label_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const Task_labelsMaxOrderByAggregateInputSchema: z.ZodType<Prisma.Task_labelsMaxOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  label_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const Task_labelsMinOrderByAggregateInputSchema: z.ZodType<Prisma.Task_labelsMinOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  label_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const Task_usersUser_idTask_idCompoundUniqueInputSchema: z.ZodType<Prisma.Task_usersUser_idTask_idCompoundUniqueInput> = z.object({
  user_id: z.string(),
  task_id: z.string()
}).strict();

export const Task_usersCountOrderByAggregateInputSchema: z.ZodType<Prisma.Task_usersCountOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  user_id: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const Task_usersMaxOrderByAggregateInputSchema: z.ZodType<Prisma.Task_usersMaxOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  user_id: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const Task_usersMinOrderByAggregateInputSchema: z.ZodType<Prisma.Task_usersMinOrderByAggregateInput> = z.object({
  task_id: z.lazy(() => SortOrderSchema).optional(),
  user_id: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const IntNullableFilterSchema: z.ZodType<Prisma.IntNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const IntFilterSchema: z.ZodType<Prisma.IntFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntFilterSchema) ]).optional(),
}).strict();

export const Task_usersListRelationFilterSchema: z.ZodType<Prisma.Task_usersListRelationFilter> = z.object({
  every: z.lazy(() => Task_usersWhereInputSchema).optional(),
  some: z.lazy(() => Task_usersWhereInputSchema).optional(),
  none: z.lazy(() => Task_usersWhereInputSchema).optional()
}).strict();

export const Task_usersOrderByRelationAggregateInputSchema: z.ZodType<Prisma.Task_usersOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksCountOrderByAggregateInputSchema: z.ZodType<Prisma.TasksCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_at: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksAvgOrderByAggregateInputSchema: z.ZodType<Prisma.TasksAvgOrderByAggregateInput> = z.object({
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksMaxOrderByAggregateInputSchema: z.ZodType<Prisma.TasksMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_at: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksMinOrderByAggregateInputSchema: z.ZodType<Prisma.TasksMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_at: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksSumOrderByAggregateInputSchema: z.ZodType<Prisma.TasksSumOrderByAggregateInput> = z.object({
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const IntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.IntNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional()
}).strict();

export const IntWithAggregatesFilterSchema: z.ZodType<Prisma.IntWithAggregatesFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedIntFilterSchema).optional(),
  _max: z.lazy(() => NestedIntFilterSchema).optional()
}).strict();

export const ProjectsCreateNestedOneWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsCreateNestedOneWithoutLabelsInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutLabelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutLabelsInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional()
}).strict();

export const Task_labelsCreateNestedManyWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsCreateNestedManyWithoutLabelsInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyLabelsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const Task_labelsUncheckedCreateNestedManyWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUncheckedCreateNestedManyWithoutLabelsInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyLabelsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const StringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional()
}).strict();

export const NullableStringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableStringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional().nullable()
}).strict();

export const ProjectsUpdateOneRequiredWithoutLabelsNestedInputSchema: z.ZodType<Prisma.ProjectsUpdateOneRequiredWithoutLabelsNestedInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutLabelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutLabelsInputSchema).optional(),
  upsert: z.lazy(() => ProjectsUpsertWithoutLabelsInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutLabelsInputSchema) ]).optional(),
}).strict();

export const Task_labelsUpdateManyWithoutLabelsNestedInputSchema: z.ZodType<Prisma.Task_labelsUpdateManyWithoutLabelsNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutLabelsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyLabelsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutLabelsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_labelsUpdateManyWithWhereWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpdateManyWithWhereWithoutLabelsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const Task_labelsUncheckedUpdateManyWithoutLabelsNestedInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateManyWithoutLabelsNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutLabelsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutLabelsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyLabelsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutLabelsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_labelsUpdateManyWithWhereWithoutLabelsInputSchema),z.lazy(() => Task_labelsUpdateManyWithWhereWithoutLabelsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const LabelsCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsCreateWithoutProjectsInputSchema).array(),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => LabelsCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const TasksCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.TasksCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const LabelsUncheckedCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsCreateWithoutProjectsInputSchema).array(),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => LabelsCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const TasksUncheckedCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const DateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.DateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional()
}).strict();

export const NullableDateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableDateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional().nullable()
}).strict();

export const LabelsUpdateManyWithoutProjectsNestedInputSchema: z.ZodType<Prisma.LabelsUpdateManyWithoutProjectsNestedInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsCreateWithoutProjectsInputSchema).array(),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => LabelsUpsertWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => LabelsUpsertWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => LabelsCreateManyProjectsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => LabelsUpdateWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => LabelsUpdateWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => LabelsUpdateManyWithWhereWithoutProjectsInputSchema),z.lazy(() => LabelsUpdateManyWithWhereWithoutProjectsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => LabelsScalarWhereInputSchema),z.lazy(() => LabelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const TasksUpdateManyWithoutProjectsNestedInputSchema: z.ZodType<Prisma.TasksUpdateManyWithoutProjectsNestedInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => TasksUpsertWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => TasksUpsertWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => TasksUpdateWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => TasksUpdateWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => TasksUpdateManyWithWhereWithoutProjectsInputSchema),z.lazy(() => TasksUpdateManyWithWhereWithoutProjectsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => TasksScalarWhereInputSchema),z.lazy(() => TasksScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const LabelsUncheckedUpdateManyWithoutProjectsNestedInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateManyWithoutProjectsNestedInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsCreateWithoutProjectsInputSchema).array(),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => LabelsCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => LabelsUpsertWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => LabelsUpsertWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => LabelsCreateManyProjectsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => LabelsWhereUniqueInputSchema),z.lazy(() => LabelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => LabelsUpdateWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => LabelsUpdateWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => LabelsUpdateManyWithWhereWithoutProjectsInputSchema),z.lazy(() => LabelsUpdateManyWithWhereWithoutProjectsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => LabelsScalarWhereInputSchema),z.lazy(() => LabelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const TasksUncheckedUpdateManyWithoutProjectsNestedInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyWithoutProjectsNestedInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => TasksUpsertWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => TasksUpsertWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => TasksUpdateWithWhereUniqueWithoutProjectsInputSchema),z.lazy(() => TasksUpdateWithWhereUniqueWithoutProjectsInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => TasksUpdateManyWithWhereWithoutProjectsInputSchema),z.lazy(() => TasksUpdateManyWithWhereWithoutProjectsInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => TasksScalarWhereInputSchema),z.lazy(() => TasksScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const LabelsCreateNestedOneWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsCreateNestedOneWithoutTask_labelsInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutTask_labelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => LabelsCreateOrConnectWithoutTask_labelsInputSchema).optional(),
  connect: z.lazy(() => LabelsWhereUniqueInputSchema).optional()
}).strict();

export const TasksCreateNestedOneWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksCreateNestedOneWithoutTask_labelsInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_labelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => TasksCreateOrConnectWithoutTask_labelsInputSchema).optional(),
  connect: z.lazy(() => TasksWhereUniqueInputSchema).optional()
}).strict();

export const LabelsUpdateOneRequiredWithoutTask_labelsNestedInputSchema: z.ZodType<Prisma.LabelsUpdateOneRequiredWithoutTask_labelsNestedInput> = z.object({
  create: z.union([ z.lazy(() => LabelsCreateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutTask_labelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => LabelsCreateOrConnectWithoutTask_labelsInputSchema).optional(),
  upsert: z.lazy(() => LabelsUpsertWithoutTask_labelsInputSchema).optional(),
  connect: z.lazy(() => LabelsWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => LabelsUpdateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedUpdateWithoutTask_labelsInputSchema) ]).optional(),
}).strict();

export const TasksUpdateOneRequiredWithoutTask_labelsNestedInputSchema: z.ZodType<Prisma.TasksUpdateOneRequiredWithoutTask_labelsNestedInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_labelsInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => TasksCreateOrConnectWithoutTask_labelsInputSchema).optional(),
  upsert: z.lazy(() => TasksUpsertWithoutTask_labelsInputSchema).optional(),
  connect: z.lazy(() => TasksWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => TasksUpdateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutTask_labelsInputSchema) ]).optional(),
}).strict();

export const TasksCreateNestedOneWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksCreateNestedOneWithoutTask_usersInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_usersInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => TasksCreateOrConnectWithoutTask_usersInputSchema).optional(),
  connect: z.lazy(() => TasksWhereUniqueInputSchema).optional()
}).strict();

export const TasksUpdateOneRequiredWithoutTask_usersNestedInputSchema: z.ZodType<Prisma.TasksUpdateOneRequiredWithoutTask_usersNestedInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_usersInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => TasksCreateOrConnectWithoutTask_usersInputSchema).optional(),
  upsert: z.lazy(() => TasksUpsertWithoutTask_usersInputSchema).optional(),
  connect: z.lazy(() => TasksWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => TasksUpdateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutTask_usersInputSchema) ]).optional(),
}).strict();

export const Task_labelsCreateNestedManyWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsCreateNestedManyWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyTasksInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const Task_usersCreateNestedManyWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersCreateNestedManyWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_usersCreateManyTasksInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const ProjectsCreateNestedOneWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsCreateNestedOneWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutTasksInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional()
}).strict();

export const Task_labelsUncheckedCreateNestedManyWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUncheckedCreateNestedManyWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyTasksInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const Task_usersUncheckedCreateNestedManyWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUncheckedCreateNestedManyWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_usersCreateManyTasksInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const NullableIntFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableIntFieldUpdateOperationsInput> = z.object({
  set: z.number().optional().nullable(),
  increment: z.number().optional(),
  decrement: z.number().optional(),
  multiply: z.number().optional(),
  divide: z.number().optional()
}).strict();

export const IntFieldUpdateOperationsInputSchema: z.ZodType<Prisma.IntFieldUpdateOperationsInput> = z.object({
  set: z.number().optional(),
  increment: z.number().optional(),
  decrement: z.number().optional(),
  multiply: z.number().optional(),
  divide: z.number().optional()
}).strict();

export const Task_labelsUpdateManyWithoutTasksNestedInputSchema: z.ZodType<Prisma.Task_labelsUpdateManyWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyTasksInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_labelsUpdateManyWithWhereWithoutTasksInputSchema),z.lazy(() => Task_labelsUpdateManyWithWhereWithoutTasksInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const Task_usersUpdateManyWithoutTasksNestedInputSchema: z.ZodType<Prisma.Task_usersUpdateManyWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_usersUpsertWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_usersUpsertWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_usersCreateManyTasksInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_usersUpdateWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_usersUpdateWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_usersUpdateManyWithWhereWithoutTasksInputSchema),z.lazy(() => Task_usersUpdateManyWithWhereWithoutTasksInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_usersScalarWhereInputSchema),z.lazy(() => Task_usersScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema: z.ZodType<Prisma.ProjectsUpdateOneRequiredWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutTasksInputSchema).optional(),
  upsert: z.lazy(() => ProjectsUpsertWithoutTasksInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutTasksInputSchema) ]).optional(),
}).strict();

export const Task_labelsUncheckedUpdateManyWithoutTasksNestedInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateManyWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_labelsCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_labelsUpsertWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_labelsCreateManyTasksInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_labelsWhereUniqueInputSchema),z.lazy(() => Task_labelsWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_labelsUpdateWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_labelsUpdateManyWithWhereWithoutTasksInputSchema),z.lazy(() => Task_labelsUpdateManyWithWhereWithoutTasksInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const Task_usersUncheckedUpdateManyWithoutTasksNestedInputSchema: z.ZodType<Prisma.Task_usersUncheckedUpdateManyWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersCreateWithoutTasksInputSchema).array(),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema),z.lazy(() => Task_usersCreateOrConnectWithoutTasksInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => Task_usersUpsertWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_usersUpsertWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  createMany: z.lazy(() => Task_usersCreateManyTasksInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => Task_usersWhereUniqueInputSchema),z.lazy(() => Task_usersWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => Task_usersUpdateWithWhereUniqueWithoutTasksInputSchema),z.lazy(() => Task_usersUpdateWithWhereUniqueWithoutTasksInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => Task_usersUpdateManyWithWhereWithoutTasksInputSchema),z.lazy(() => Task_usersUpdateManyWithWhereWithoutTasksInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => Task_usersScalarWhereInputSchema),z.lazy(() => Task_usersScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const NestedUuidFilterSchema: z.ZodType<Prisma.NestedUuidFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedUuidFilterSchema) ]).optional(),
}).strict();

export const NestedStringFilterSchema: z.ZodType<Prisma.NestedStringFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const NestedStringNullableFilterSchema: z.ZodType<Prisma.NestedStringNullableFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedUuidWithAggregatesFilterSchema: z.ZodType<Prisma.NestedUuidWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedUuidWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const NestedIntFilterSchema: z.ZodType<Prisma.NestedIntFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntFilterSchema) ]).optional(),
}).strict();

export const NestedStringWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const NestedStringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringNullableWithAggregatesFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional()
}).strict();

export const NestedIntNullableFilterSchema: z.ZodType<Prisma.NestedIntNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedDateTimeFilterSchema: z.ZodType<Prisma.NestedDateTimeFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const NestedDateTimeNullableFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedDateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional()
}).strict();

export const NestedDateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional()
}).strict();

export const NestedIntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedIntNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional()
}).strict();

export const NestedFloatNullableFilterSchema: z.ZodType<Prisma.NestedFloatNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedIntWithAggregatesFilterSchema: z.ZodType<Prisma.NestedIntWithAggregatesFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedIntFilterSchema).optional(),
  _max: z.lazy(() => NestedIntFilterSchema).optional()
}).strict();

export const NestedFloatFilterSchema: z.ZodType<Prisma.NestedFloatFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatFilterSchema) ]).optional(),
}).strict();

export const ProjectsCreateWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsCreateWithoutLabelsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  tasks: z.lazy(() => TasksCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUncheckedCreateWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsUncheckedCreateWithoutLabelsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  tasks: z.lazy(() => TasksUncheckedCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsCreateOrConnectWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsCreateOrConnectWithoutLabelsInput> = z.object({
  where: z.lazy(() => ProjectsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ProjectsCreateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutLabelsInputSchema) ]),
}).strict();

export const Task_labelsCreateWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsCreateWithoutLabelsInput> = z.object({
  tasks: z.lazy(() => TasksCreateNestedOneWithoutTask_labelsInputSchema)
}).strict();

export const Task_labelsUncheckedCreateWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUncheckedCreateWithoutLabelsInput> = z.object({
  task_id: z.string()
}).strict();

export const Task_labelsCreateOrConnectWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsCreateOrConnectWithoutLabelsInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema) ]),
}).strict();

export const Task_labelsCreateManyLabelsInputEnvelopeSchema: z.ZodType<Prisma.Task_labelsCreateManyLabelsInputEnvelope> = z.object({
  data: z.lazy(() => Task_labelsCreateManyLabelsInputSchema).array(),
  skipDuplicates: z.boolean().optional()
}).strict();

export const ProjectsUpsertWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsUpsertWithoutLabelsInput> = z.object({
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutLabelsInputSchema) ]),
  create: z.union([ z.lazy(() => ProjectsCreateWithoutLabelsInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutLabelsInputSchema) ]),
}).strict();

export const ProjectsUpdateWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsUpdateWithoutLabelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  tasks: z.lazy(() => TasksUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsUncheckedUpdateWithoutLabelsInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateWithoutLabelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  tasks: z.lazy(() => TasksUncheckedUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const Task_labelsUpsertWithWhereUniqueWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUpsertWithWhereUniqueWithoutLabelsInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedUpdateWithoutLabelsInputSchema) ]),
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutLabelsInputSchema) ]),
}).strict();

export const Task_labelsUpdateWithWhereUniqueWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUpdateWithWhereUniqueWithoutLabelsInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => Task_labelsUpdateWithoutLabelsInputSchema),z.lazy(() => Task_labelsUncheckedUpdateWithoutLabelsInputSchema) ]),
}).strict();

export const Task_labelsUpdateManyWithWhereWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUpdateManyWithWhereWithoutLabelsInput> = z.object({
  where: z.lazy(() => Task_labelsScalarWhereInputSchema),
  data: z.union([ z.lazy(() => Task_labelsUpdateManyMutationInputSchema),z.lazy(() => Task_labelsUncheckedUpdateManyWithoutTask_labelsInputSchema) ]),
}).strict();

export const Task_labelsScalarWhereInputSchema: z.ZodType<Prisma.Task_labelsScalarWhereInput> = z.object({
  AND: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_labelsScalarWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_labelsScalarWhereInputSchema),z.lazy(() => Task_labelsScalarWhereInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  label_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
}).strict();

export const LabelsCreateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsCreateNestedManyWithoutLabelsInputSchema).optional()
}).strict();

export const LabelsUncheckedCreateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedCreateNestedManyWithoutLabelsInputSchema).optional()
}).strict();

export const LabelsCreateOrConnectWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsCreateOrConnectWithoutProjectsInput> = z.object({
  where: z.lazy(() => LabelsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema) ]),
}).strict();

export const LabelsCreateManyProjectsInputEnvelopeSchema: z.ZodType<Prisma.LabelsCreateManyProjectsInputEnvelope> = z.object({
  data: z.lazy(() => LabelsCreateManyProjectsInputSchema).array(),
  skipDuplicates: z.boolean().optional()
}).strict();

export const TasksCreateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsCreateNestedManyWithoutTasksInputSchema).optional(),
  task_users: z.lazy(() => Task_usersCreateNestedManyWithoutTasksInputSchema).optional()
}).strict();

export const TasksUncheckedCreateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedCreateNestedManyWithoutTasksInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUncheckedCreateNestedManyWithoutTasksInputSchema).optional()
}).strict();

export const TasksCreateOrConnectWithoutProjectsInputSchema: z.ZodType<Prisma.TasksCreateOrConnectWithoutProjectsInput> = z.object({
  where: z.lazy(() => TasksWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema) ]),
}).strict();

export const TasksCreateManyProjectsInputEnvelopeSchema: z.ZodType<Prisma.TasksCreateManyProjectsInputEnvelope> = z.object({
  data: z.lazy(() => TasksCreateManyProjectsInputSchema).array(),
  skipDuplicates: z.boolean().optional()
}).strict();

export const LabelsUpsertWithWhereUniqueWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUpsertWithWhereUniqueWithoutProjectsInput> = z.object({
  where: z.lazy(() => LabelsWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => LabelsUpdateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedUpdateWithoutProjectsInputSchema) ]),
  create: z.union([ z.lazy(() => LabelsCreateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutProjectsInputSchema) ]),
}).strict();

export const LabelsUpdateWithWhereUniqueWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUpdateWithWhereUniqueWithoutProjectsInput> = z.object({
  where: z.lazy(() => LabelsWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => LabelsUpdateWithoutProjectsInputSchema),z.lazy(() => LabelsUncheckedUpdateWithoutProjectsInputSchema) ]),
}).strict();

export const LabelsUpdateManyWithWhereWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUpdateManyWithWhereWithoutProjectsInput> = z.object({
  where: z.lazy(() => LabelsScalarWhereInputSchema),
  data: z.union([ z.lazy(() => LabelsUpdateManyMutationInputSchema),z.lazy(() => LabelsUncheckedUpdateManyWithoutLabelsInputSchema) ]),
}).strict();

export const LabelsScalarWhereInputSchema: z.ZodType<Prisma.LabelsScalarWhereInput> = z.object({
  AND: z.union([ z.lazy(() => LabelsScalarWhereInputSchema),z.lazy(() => LabelsScalarWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsScalarWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsScalarWhereInputSchema),z.lazy(() => LabelsScalarWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
}).strict();

export const TasksUpsertWithWhereUniqueWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUpsertWithWhereUniqueWithoutProjectsInput> = z.object({
  where: z.lazy(() => TasksWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => TasksUpdateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutProjectsInputSchema) ]),
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema) ]),
}).strict();

export const TasksUpdateWithWhereUniqueWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUpdateWithWhereUniqueWithoutProjectsInput> = z.object({
  where: z.lazy(() => TasksWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => TasksUpdateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutProjectsInputSchema) ]),
}).strict();

export const TasksUpdateManyWithWhereWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUpdateManyWithWhereWithoutProjectsInput> = z.object({
  where: z.lazy(() => TasksScalarWhereInputSchema),
  data: z.union([ z.lazy(() => TasksUpdateManyMutationInputSchema),z.lazy(() => TasksUncheckedUpdateManyWithoutTasksInputSchema) ]),
}).strict();

export const TasksScalarWhereInputSchema: z.ZodType<Prisma.TasksScalarWhereInput> = z.object({
  AND: z.union([ z.lazy(() => TasksScalarWhereInputSchema),z.lazy(() => TasksScalarWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksScalarWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksScalarWhereInputSchema),z.lazy(() => TasksScalarWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntFilterSchema),z.number() ]).optional(),
  project_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
}).strict();

export const LabelsCreateWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsCreateWithoutTask_labelsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutLabelsInputSchema)
}).strict();

export const LabelsUncheckedCreateWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateWithoutTask_labelsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string()
}).strict();

export const LabelsCreateOrConnectWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsCreateOrConnectWithoutTask_labelsInput> = z.object({
  where: z.lazy(() => LabelsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => LabelsCreateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutTask_labelsInputSchema) ]),
}).strict();

export const TasksCreateWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksCreateWithoutTask_labelsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_users: z.lazy(() => Task_usersCreateNestedManyWithoutTasksInputSchema).optional(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutTasksInputSchema)
}).strict();

export const TasksUncheckedCreateWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksUncheckedCreateWithoutTask_labelsInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  project_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_users: z.lazy(() => Task_usersUncheckedCreateNestedManyWithoutTasksInputSchema).optional()
}).strict();

export const TasksCreateOrConnectWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksCreateOrConnectWithoutTask_labelsInput> = z.object({
  where: z.lazy(() => TasksWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_labelsInputSchema) ]),
}).strict();

export const LabelsUpsertWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsUpsertWithoutTask_labelsInput> = z.object({
  update: z.union([ z.lazy(() => LabelsUpdateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedUpdateWithoutTask_labelsInputSchema) ]),
  create: z.union([ z.lazy(() => LabelsCreateWithoutTask_labelsInputSchema),z.lazy(() => LabelsUncheckedCreateWithoutTask_labelsInputSchema) ]),
}).strict();

export const LabelsUpdateWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsUpdateWithoutTask_labelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsUncheckedUpdateWithoutTask_labelsInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateWithoutTask_labelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const TasksUpsertWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksUpsertWithoutTask_labelsInput> = z.object({
  update: z.union([ z.lazy(() => TasksUpdateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutTask_labelsInputSchema) ]),
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_labelsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_labelsInputSchema) ]),
}).strict();

export const TasksUpdateWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksUpdateWithoutTask_labelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_users: z.lazy(() => Task_usersUpdateManyWithoutTasksNestedInputSchema).optional(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateWithoutTask_labelsInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateWithoutTask_labelsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_users: z.lazy(() => Task_usersUncheckedUpdateManyWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksCreateWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksCreateWithoutTask_usersInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsCreateNestedManyWithoutTasksInputSchema).optional(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutTasksInputSchema)
}).strict();

export const TasksUncheckedCreateWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksUncheckedCreateWithoutTask_usersInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().optional().nullable(),
  status: z.number(),
  project_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedCreateNestedManyWithoutTasksInputSchema).optional()
}).strict();

export const TasksCreateOrConnectWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksCreateOrConnectWithoutTask_usersInput> = z.object({
  where: z.lazy(() => TasksWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_usersInputSchema) ]),
}).strict();

export const TasksUpsertWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksUpsertWithoutTask_usersInput> = z.object({
  update: z.union([ z.lazy(() => TasksUpdateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedUpdateWithoutTask_usersInputSchema) ]),
  create: z.union([ z.lazy(() => TasksCreateWithoutTask_usersInputSchema),z.lazy(() => TasksUncheckedCreateWithoutTask_usersInputSchema) ]),
}).strict();

export const TasksUpdateWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksUpdateWithoutTask_usersInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUpdateManyWithoutTasksNestedInputSchema).optional(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateWithoutTask_usersInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateWithoutTask_usersInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedUpdateManyWithoutTasksNestedInputSchema).optional()
}).strict();

export const Task_labelsCreateWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsCreateWithoutTasksInput> = z.object({
  labels: z.lazy(() => LabelsCreateNestedOneWithoutTask_labelsInputSchema)
}).strict();

export const Task_labelsUncheckedCreateWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUncheckedCreateWithoutTasksInput> = z.object({
  label_id: z.string()
}).strict();

export const Task_labelsCreateOrConnectWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsCreateOrConnectWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const Task_labelsCreateManyTasksInputEnvelopeSchema: z.ZodType<Prisma.Task_labelsCreateManyTasksInputEnvelope> = z.object({
  data: z.lazy(() => Task_labelsCreateManyTasksInputSchema).array(),
  skipDuplicates: z.boolean().optional()
}).strict();

export const Task_usersCreateWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersCreateWithoutTasksInput> = z.object({
  user_id: z.string(),
  role: z.string()
}).strict();

export const Task_usersUncheckedCreateWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUncheckedCreateWithoutTasksInput> = z.object({
  user_id: z.string(),
  role: z.string()
}).strict();

export const Task_usersCreateOrConnectWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersCreateOrConnectWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_usersWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const Task_usersCreateManyTasksInputEnvelopeSchema: z.ZodType<Prisma.Task_usersCreateManyTasksInputEnvelope> = z.object({
  data: z.lazy(() => Task_usersCreateManyTasksInputSchema).array(),
  skipDuplicates: z.boolean().optional()
}).strict();

export const ProjectsCreateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsCreateWithoutTasksInput> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  labels: z.lazy(() => LabelsCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUncheckedCreateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUncheckedCreateWithoutTasksInput> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  color: z.string(),
  workspace_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  labels: z.lazy(() => LabelsUncheckedCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsCreateOrConnectWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsCreateOrConnectWithoutTasksInput> = z.object({
  where: z.lazy(() => ProjectsWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const Task_labelsUpsertWithWhereUniqueWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUpsertWithWhereUniqueWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => Task_labelsUpdateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedUpdateWithoutTasksInputSchema) ]),
  create: z.union([ z.lazy(() => Task_labelsCreateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const Task_labelsUpdateWithWhereUniqueWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUpdateWithWhereUniqueWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_labelsWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => Task_labelsUpdateWithoutTasksInputSchema),z.lazy(() => Task_labelsUncheckedUpdateWithoutTasksInputSchema) ]),
}).strict();

export const Task_labelsUpdateManyWithWhereWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUpdateManyWithWhereWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_labelsScalarWhereInputSchema),
  data: z.union([ z.lazy(() => Task_labelsUpdateManyMutationInputSchema),z.lazy(() => Task_labelsUncheckedUpdateManyWithoutTask_labelsInputSchema) ]),
}).strict();

export const Task_usersUpsertWithWhereUniqueWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUpsertWithWhereUniqueWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_usersWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => Task_usersUpdateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedUpdateWithoutTasksInputSchema) ]),
  create: z.union([ z.lazy(() => Task_usersCreateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const Task_usersUpdateWithWhereUniqueWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUpdateWithWhereUniqueWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_usersWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => Task_usersUpdateWithoutTasksInputSchema),z.lazy(() => Task_usersUncheckedUpdateWithoutTasksInputSchema) ]),
}).strict();

export const Task_usersUpdateManyWithWhereWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUpdateManyWithWhereWithoutTasksInput> = z.object({
  where: z.lazy(() => Task_usersScalarWhereInputSchema),
  data: z.union([ z.lazy(() => Task_usersUpdateManyMutationInputSchema),z.lazy(() => Task_usersUncheckedUpdateManyWithoutTask_usersInputSchema) ]),
}).strict();

export const Task_usersScalarWhereInputSchema: z.ZodType<Prisma.Task_usersScalarWhereInput> = z.object({
  AND: z.union([ z.lazy(() => Task_usersScalarWhereInputSchema),z.lazy(() => Task_usersScalarWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => Task_usersScalarWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => Task_usersScalarWhereInputSchema),z.lazy(() => Task_usersScalarWhereInputSchema).array() ]).optional(),
  task_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  user_id: z.union([ z.lazy(() => UuidFilterSchema),z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
}).strict();

export const ProjectsUpsertWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUpsertWithoutTasksInput> = z.object({
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutTasksInputSchema) ]),
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]),
}).strict();

export const ProjectsUpdateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUpdateWithoutTasksInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labels: z.lazy(() => LabelsUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsUncheckedUpdateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateWithoutTasksInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  workspace_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labels: z.lazy(() => LabelsUncheckedUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const Task_labelsCreateManyLabelsInputSchema: z.ZodType<Prisma.Task_labelsCreateManyLabelsInput> = z.object({
  task_id: z.string().uuid()
}).strict();

export const Task_labelsUpdateWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUpdateWithoutLabelsInput> = z.object({
  tasks: z.lazy(() => TasksUpdateOneRequiredWithoutTask_labelsNestedInputSchema).optional()
}).strict();

export const Task_labelsUncheckedUpdateWithoutLabelsInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateWithoutLabelsInput> = z.object({
  task_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_labelsUncheckedUpdateManyWithoutTask_labelsInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateManyWithoutTask_labelsInput> = z.object({
  task_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const LabelsCreateManyProjectsInputSchema: z.ZodType<Prisma.LabelsCreateManyProjectsInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable()
}).strict();

export const TasksCreateManyProjectsInputSchema: z.ZodType<Prisma.TasksCreateManyProjectsInput> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable()
}).strict();

export const LabelsUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUpdateManyWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsUncheckedUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedUpdateManyWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsUncheckedUpdateManyWithoutLabelsInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateManyWithoutLabelsInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUpdateManyWithoutTasksNestedInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUpdateManyWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number(),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  task_labels: z.lazy(() => Task_labelsUncheckedUpdateManyWithoutTasksNestedInputSchema).optional(),
  task_users: z.lazy(() => Task_usersUncheckedUpdateManyWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateManyWithoutTasksInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyWithoutTasksInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const Task_labelsCreateManyTasksInputSchema: z.ZodType<Prisma.Task_labelsCreateManyTasksInput> = z.object({
  label_id: z.string().uuid()
}).strict();

export const Task_usersCreateManyTasksInputSchema: z.ZodType<Prisma.Task_usersCreateManyTasksInput> = z.object({
  user_id: z.string().uuid(),
  role: z.string()
}).strict();

export const Task_labelsUpdateWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUpdateWithoutTasksInput> = z.object({
  labels: z.lazy(() => LabelsUpdateOneRequiredWithoutTask_labelsNestedInputSchema).optional()
}).strict();

export const Task_labelsUncheckedUpdateWithoutTasksInputSchema: z.ZodType<Prisma.Task_labelsUncheckedUpdateWithoutTasksInput> = z.object({
  label_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersUpdateWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUpdateWithoutTasksInput> = z.object({
  user_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersUncheckedUpdateWithoutTasksInputSchema: z.ZodType<Prisma.Task_usersUncheckedUpdateWithoutTasksInput> = z.object({
  user_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const Task_usersUncheckedUpdateManyWithoutTask_usersInputSchema: z.ZodType<Prisma.Task_usersUncheckedUpdateManyWithoutTask_usersInput> = z.object({
  user_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

/////////////////////////////////////////
// ARGS
/////////////////////////////////////////

export const LabelsFindFirstArgsSchema: z.ZodType<Prisma.LabelsFindFirstArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: LabelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.LabelsFindFirstArgs>

export const LabelsFindFirstOrThrowArgsSchema: z.ZodType<Prisma.LabelsFindFirstOrThrowArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: LabelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.LabelsFindFirstOrThrowArgs>

export const LabelsFindManyArgsSchema: z.ZodType<Prisma.LabelsFindManyArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: LabelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.LabelsFindManyArgs>

export const LabelsAggregateArgsSchema: z.ZodType<Prisma.LabelsAggregateArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.LabelsAggregateArgs>

export const LabelsGroupByArgsSchema: z.ZodType<Prisma.LabelsGroupByArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithAggregationInputSchema.array(),LabelsOrderByWithAggregationInputSchema ]).optional(),
  by: LabelsScalarFieldEnumSchema.array(),
  having: LabelsScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.LabelsGroupByArgs>

export const LabelsFindUniqueArgsSchema: z.ZodType<Prisma.LabelsFindUniqueArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.LabelsFindUniqueArgs>

export const LabelsFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.LabelsFindUniqueOrThrowArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.LabelsFindUniqueOrThrowArgs>

export const ProjectsFindFirstArgsSchema: z.ZodType<Prisma.ProjectsFindFirstArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereInputSchema.optional(),
  orderBy: z.union([ ProjectsOrderByWithRelationInputSchema.array(),ProjectsOrderByWithRelationInputSchema ]).optional(),
  cursor: ProjectsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: ProjectsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.ProjectsFindFirstArgs>

export const ProjectsFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ProjectsFindFirstOrThrowArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereInputSchema.optional(),
  orderBy: z.union([ ProjectsOrderByWithRelationInputSchema.array(),ProjectsOrderByWithRelationInputSchema ]).optional(),
  cursor: ProjectsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: ProjectsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.ProjectsFindFirstOrThrowArgs>

export const ProjectsFindManyArgsSchema: z.ZodType<Prisma.ProjectsFindManyArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereInputSchema.optional(),
  orderBy: z.union([ ProjectsOrderByWithRelationInputSchema.array(),ProjectsOrderByWithRelationInputSchema ]).optional(),
  cursor: ProjectsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: ProjectsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.ProjectsFindManyArgs>

export const ProjectsAggregateArgsSchema: z.ZodType<Prisma.ProjectsAggregateArgs> = z.object({
  where: ProjectsWhereInputSchema.optional(),
  orderBy: z.union([ ProjectsOrderByWithRelationInputSchema.array(),ProjectsOrderByWithRelationInputSchema ]).optional(),
  cursor: ProjectsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.ProjectsAggregateArgs>

export const ProjectsGroupByArgsSchema: z.ZodType<Prisma.ProjectsGroupByArgs> = z.object({
  where: ProjectsWhereInputSchema.optional(),
  orderBy: z.union([ ProjectsOrderByWithAggregationInputSchema.array(),ProjectsOrderByWithAggregationInputSchema ]).optional(),
  by: ProjectsScalarFieldEnumSchema.array(),
  having: ProjectsScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.ProjectsGroupByArgs>

export const ProjectsFindUniqueArgsSchema: z.ZodType<Prisma.ProjectsFindUniqueArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.ProjectsFindUniqueArgs>

export const ProjectsFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ProjectsFindUniqueOrThrowArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.ProjectsFindUniqueOrThrowArgs>

export const Task_labelsFindFirstArgsSchema: z.ZodType<Prisma.Task_labelsFindFirstArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereInputSchema.optional(),
  orderBy: z.union([ Task_labelsOrderByWithRelationInputSchema.array(),Task_labelsOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_labelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_labelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsFindFirstArgs>

export const Task_labelsFindFirstOrThrowArgsSchema: z.ZodType<Prisma.Task_labelsFindFirstOrThrowArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereInputSchema.optional(),
  orderBy: z.union([ Task_labelsOrderByWithRelationInputSchema.array(),Task_labelsOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_labelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_labelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsFindFirstOrThrowArgs>

export const Task_labelsFindManyArgsSchema: z.ZodType<Prisma.Task_labelsFindManyArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereInputSchema.optional(),
  orderBy: z.union([ Task_labelsOrderByWithRelationInputSchema.array(),Task_labelsOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_labelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_labelsScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsFindManyArgs>

export const Task_labelsAggregateArgsSchema: z.ZodType<Prisma.Task_labelsAggregateArgs> = z.object({
  where: Task_labelsWhereInputSchema.optional(),
  orderBy: z.union([ Task_labelsOrderByWithRelationInputSchema.array(),Task_labelsOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_labelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsAggregateArgs>

export const Task_labelsGroupByArgsSchema: z.ZodType<Prisma.Task_labelsGroupByArgs> = z.object({
  where: Task_labelsWhereInputSchema.optional(),
  orderBy: z.union([ Task_labelsOrderByWithAggregationInputSchema.array(),Task_labelsOrderByWithAggregationInputSchema ]).optional(),
  by: Task_labelsScalarFieldEnumSchema.array(),
  having: Task_labelsScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsGroupByArgs>

export const Task_labelsFindUniqueArgsSchema: z.ZodType<Prisma.Task_labelsFindUniqueArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_labelsFindUniqueArgs>

export const Task_labelsFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.Task_labelsFindUniqueOrThrowArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_labelsFindUniqueOrThrowArgs>

export const Task_usersFindFirstArgsSchema: z.ZodType<Prisma.Task_usersFindFirstArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereInputSchema.optional(),
  orderBy: z.union([ Task_usersOrderByWithRelationInputSchema.array(),Task_usersOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_usersWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_usersScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_usersFindFirstArgs>

export const Task_usersFindFirstOrThrowArgsSchema: z.ZodType<Prisma.Task_usersFindFirstOrThrowArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereInputSchema.optional(),
  orderBy: z.union([ Task_usersOrderByWithRelationInputSchema.array(),Task_usersOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_usersWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_usersScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_usersFindFirstOrThrowArgs>

export const Task_usersFindManyArgsSchema: z.ZodType<Prisma.Task_usersFindManyArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereInputSchema.optional(),
  orderBy: z.union([ Task_usersOrderByWithRelationInputSchema.array(),Task_usersOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_usersWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: Task_usersScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.Task_usersFindManyArgs>

export const Task_usersAggregateArgsSchema: z.ZodType<Prisma.Task_usersAggregateArgs> = z.object({
  where: Task_usersWhereInputSchema.optional(),
  orderBy: z.union([ Task_usersOrderByWithRelationInputSchema.array(),Task_usersOrderByWithRelationInputSchema ]).optional(),
  cursor: Task_usersWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.Task_usersAggregateArgs>

export const Task_usersGroupByArgsSchema: z.ZodType<Prisma.Task_usersGroupByArgs> = z.object({
  where: Task_usersWhereInputSchema.optional(),
  orderBy: z.union([ Task_usersOrderByWithAggregationInputSchema.array(),Task_usersOrderByWithAggregationInputSchema ]).optional(),
  by: Task_usersScalarFieldEnumSchema.array(),
  having: Task_usersScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.Task_usersGroupByArgs>

export const Task_usersFindUniqueArgsSchema: z.ZodType<Prisma.Task_usersFindUniqueArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_usersFindUniqueArgs>

export const Task_usersFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.Task_usersFindUniqueOrThrowArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_usersFindUniqueOrThrowArgs>

export const TasksFindFirstArgsSchema: z.ZodType<Prisma.TasksFindFirstArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: TasksScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.TasksFindFirstArgs>

export const TasksFindFirstOrThrowArgsSchema: z.ZodType<Prisma.TasksFindFirstOrThrowArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: TasksScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.TasksFindFirstOrThrowArgs>

export const TasksFindManyArgsSchema: z.ZodType<Prisma.TasksFindManyArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: TasksScalarFieldEnumSchema.array().optional(),
}).strict() as z.ZodType<Prisma.TasksFindManyArgs>

export const TasksAggregateArgsSchema: z.ZodType<Prisma.TasksAggregateArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.TasksAggregateArgs>

export const TasksGroupByArgsSchema: z.ZodType<Prisma.TasksGroupByArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithAggregationInputSchema.array(),TasksOrderByWithAggregationInputSchema ]).optional(),
  by: TasksScalarFieldEnumSchema.array(),
  having: TasksScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() as z.ZodType<Prisma.TasksGroupByArgs>

export const TasksFindUniqueArgsSchema: z.ZodType<Prisma.TasksFindUniqueArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.TasksFindUniqueArgs>

export const TasksFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.TasksFindUniqueOrThrowArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.TasksFindUniqueOrThrowArgs>

export const LabelsCreateArgsSchema: z.ZodType<Prisma.LabelsCreateArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  data: z.union([ LabelsCreateInputSchema,LabelsUncheckedCreateInputSchema ]),
}).strict() as z.ZodType<Prisma.LabelsCreateArgs>

export const LabelsUpsertArgsSchema: z.ZodType<Prisma.LabelsUpsertArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
  create: z.union([ LabelsCreateInputSchema,LabelsUncheckedCreateInputSchema ]),
  update: z.union([ LabelsUpdateInputSchema,LabelsUncheckedUpdateInputSchema ]),
}).strict() as z.ZodType<Prisma.LabelsUpsertArgs>

export const LabelsCreateManyArgsSchema: z.ZodType<Prisma.LabelsCreateManyArgs> = z.object({
  data: LabelsCreateManyInputSchema.array(),
  skipDuplicates: z.boolean().optional(),
}).strict() as z.ZodType<Prisma.LabelsCreateManyArgs>

export const LabelsDeleteArgsSchema: z.ZodType<Prisma.LabelsDeleteArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.LabelsDeleteArgs>

export const LabelsUpdateArgsSchema: z.ZodType<Prisma.LabelsUpdateArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  include: LabelsIncludeSchema.optional(),
  data: z.union([ LabelsUpdateInputSchema,LabelsUncheckedUpdateInputSchema ]),
  where: LabelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.LabelsUpdateArgs>

export const LabelsUpdateManyArgsSchema: z.ZodType<Prisma.LabelsUpdateManyArgs> = z.object({
  data: z.union([ LabelsUpdateManyMutationInputSchema,LabelsUncheckedUpdateManyInputSchema ]),
  where: LabelsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.LabelsUpdateManyArgs>

export const LabelsDeleteManyArgsSchema: z.ZodType<Prisma.LabelsDeleteManyArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.LabelsDeleteManyArgs>

export const ProjectsCreateArgsSchema: z.ZodType<Prisma.ProjectsCreateArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  data: z.union([ ProjectsCreateInputSchema,ProjectsUncheckedCreateInputSchema ]),
}).strict() as z.ZodType<Prisma.ProjectsCreateArgs>

export const ProjectsUpsertArgsSchema: z.ZodType<Prisma.ProjectsUpsertArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereUniqueInputSchema,
  create: z.union([ ProjectsCreateInputSchema,ProjectsUncheckedCreateInputSchema ]),
  update: z.union([ ProjectsUpdateInputSchema,ProjectsUncheckedUpdateInputSchema ]),
}).strict() as z.ZodType<Prisma.ProjectsUpsertArgs>

export const ProjectsCreateManyArgsSchema: z.ZodType<Prisma.ProjectsCreateManyArgs> = z.object({
  data: ProjectsCreateManyInputSchema.array(),
  skipDuplicates: z.boolean().optional(),
}).strict() as z.ZodType<Prisma.ProjectsCreateManyArgs>

export const ProjectsDeleteArgsSchema: z.ZodType<Prisma.ProjectsDeleteArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  where: ProjectsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.ProjectsDeleteArgs>

export const ProjectsUpdateArgsSchema: z.ZodType<Prisma.ProjectsUpdateArgs> = z.object({
  select: ProjectsSelectSchema.optional(),
  include: ProjectsIncludeSchema.optional(),
  data: z.union([ ProjectsUpdateInputSchema,ProjectsUncheckedUpdateInputSchema ]),
  where: ProjectsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.ProjectsUpdateArgs>

export const ProjectsUpdateManyArgsSchema: z.ZodType<Prisma.ProjectsUpdateManyArgs> = z.object({
  data: z.union([ ProjectsUpdateManyMutationInputSchema,ProjectsUncheckedUpdateManyInputSchema ]),
  where: ProjectsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.ProjectsUpdateManyArgs>

export const ProjectsDeleteManyArgsSchema: z.ZodType<Prisma.ProjectsDeleteManyArgs> = z.object({
  where: ProjectsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.ProjectsDeleteManyArgs>

export const Task_labelsCreateArgsSchema: z.ZodType<Prisma.Task_labelsCreateArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  data: z.union([ Task_labelsCreateInputSchema,Task_labelsUncheckedCreateInputSchema ]),
}).strict() as z.ZodType<Prisma.Task_labelsCreateArgs>

export const Task_labelsUpsertArgsSchema: z.ZodType<Prisma.Task_labelsUpsertArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereUniqueInputSchema,
  create: z.union([ Task_labelsCreateInputSchema,Task_labelsUncheckedCreateInputSchema ]),
  update: z.union([ Task_labelsUpdateInputSchema,Task_labelsUncheckedUpdateInputSchema ]),
}).strict() as z.ZodType<Prisma.Task_labelsUpsertArgs>

export const Task_labelsCreateManyArgsSchema: z.ZodType<Prisma.Task_labelsCreateManyArgs> = z.object({
  data: Task_labelsCreateManyInputSchema.array(),
  skipDuplicates: z.boolean().optional(),
}).strict() as z.ZodType<Prisma.Task_labelsCreateManyArgs>

export const Task_labelsDeleteArgsSchema: z.ZodType<Prisma.Task_labelsDeleteArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  where: Task_labelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_labelsDeleteArgs>

export const Task_labelsUpdateArgsSchema: z.ZodType<Prisma.Task_labelsUpdateArgs> = z.object({
  select: Task_labelsSelectSchema.optional(),
  include: Task_labelsIncludeSchema.optional(),
  data: z.union([ Task_labelsUpdateInputSchema,Task_labelsUncheckedUpdateInputSchema ]),
  where: Task_labelsWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_labelsUpdateArgs>

export const Task_labelsUpdateManyArgsSchema: z.ZodType<Prisma.Task_labelsUpdateManyArgs> = z.object({
  data: z.union([ Task_labelsUpdateManyMutationInputSchema,Task_labelsUncheckedUpdateManyInputSchema ]),
  where: Task_labelsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.Task_labelsUpdateManyArgs>

export const Task_labelsDeleteManyArgsSchema: z.ZodType<Prisma.Task_labelsDeleteManyArgs> = z.object({
  where: Task_labelsWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.Task_labelsDeleteManyArgs>

export const Task_usersCreateArgsSchema: z.ZodType<Prisma.Task_usersCreateArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  data: z.union([ Task_usersCreateInputSchema,Task_usersUncheckedCreateInputSchema ]),
}).strict() as z.ZodType<Prisma.Task_usersCreateArgs>

export const Task_usersUpsertArgsSchema: z.ZodType<Prisma.Task_usersUpsertArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereUniqueInputSchema,
  create: z.union([ Task_usersCreateInputSchema,Task_usersUncheckedCreateInputSchema ]),
  update: z.union([ Task_usersUpdateInputSchema,Task_usersUncheckedUpdateInputSchema ]),
}).strict() as z.ZodType<Prisma.Task_usersUpsertArgs>

export const Task_usersCreateManyArgsSchema: z.ZodType<Prisma.Task_usersCreateManyArgs> = z.object({
  data: Task_usersCreateManyInputSchema.array(),
  skipDuplicates: z.boolean().optional(),
}).strict() as z.ZodType<Prisma.Task_usersCreateManyArgs>

export const Task_usersDeleteArgsSchema: z.ZodType<Prisma.Task_usersDeleteArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  where: Task_usersWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_usersDeleteArgs>

export const Task_usersUpdateArgsSchema: z.ZodType<Prisma.Task_usersUpdateArgs> = z.object({
  select: Task_usersSelectSchema.optional(),
  include: Task_usersIncludeSchema.optional(),
  data: z.union([ Task_usersUpdateInputSchema,Task_usersUncheckedUpdateInputSchema ]),
  where: Task_usersWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.Task_usersUpdateArgs>

export const Task_usersUpdateManyArgsSchema: z.ZodType<Prisma.Task_usersUpdateManyArgs> = z.object({
  data: z.union([ Task_usersUpdateManyMutationInputSchema,Task_usersUncheckedUpdateManyInputSchema ]),
  where: Task_usersWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.Task_usersUpdateManyArgs>

export const Task_usersDeleteManyArgsSchema: z.ZodType<Prisma.Task_usersDeleteManyArgs> = z.object({
  where: Task_usersWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.Task_usersDeleteManyArgs>

export const TasksCreateArgsSchema: z.ZodType<Prisma.TasksCreateArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  data: z.union([ TasksCreateInputSchema,TasksUncheckedCreateInputSchema ]),
}).strict() as z.ZodType<Prisma.TasksCreateArgs>

export const TasksUpsertArgsSchema: z.ZodType<Prisma.TasksUpsertArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereUniqueInputSchema,
  create: z.union([ TasksCreateInputSchema,TasksUncheckedCreateInputSchema ]),
  update: z.union([ TasksUpdateInputSchema,TasksUncheckedUpdateInputSchema ]),
}).strict() as z.ZodType<Prisma.TasksUpsertArgs>

export const TasksCreateManyArgsSchema: z.ZodType<Prisma.TasksCreateManyArgs> = z.object({
  data: TasksCreateManyInputSchema.array(),
  skipDuplicates: z.boolean().optional(),
}).strict() as z.ZodType<Prisma.TasksCreateManyArgs>

export const TasksDeleteArgsSchema: z.ZodType<Prisma.TasksDeleteArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.TasksDeleteArgs>

export const TasksUpdateArgsSchema: z.ZodType<Prisma.TasksUpdateArgs> = z.object({
  select: TasksSelectSchema.optional(),
  include: TasksIncludeSchema.optional(),
  data: z.union([ TasksUpdateInputSchema,TasksUncheckedUpdateInputSchema ]),
  where: TasksWhereUniqueInputSchema,
}).strict() as z.ZodType<Prisma.TasksUpdateArgs>

export const TasksUpdateManyArgsSchema: z.ZodType<Prisma.TasksUpdateManyArgs> = z.object({
  data: z.union([ TasksUpdateManyMutationInputSchema,TasksUncheckedUpdateManyInputSchema ]),
  where: TasksWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.TasksUpdateManyArgs>

export const TasksDeleteManyArgsSchema: z.ZodType<Prisma.TasksDeleteManyArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
}).strict() as z.ZodType<Prisma.TasksDeleteManyArgs>

interface LabelsGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.LabelsArgs
  readonly type: Omit<Prisma.LabelsGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

interface ProjectsGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.ProjectsArgs
  readonly type: Omit<Prisma.ProjectsGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

interface Task_labelsGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.Task_labelsArgs
  readonly type: Omit<Prisma.Task_labelsGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

interface Task_usersGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.Task_usersArgs
  readonly type: Omit<Prisma.Task_usersGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

interface TasksGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.TasksArgs
  readonly type: Omit<Prisma.TasksGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

export const tableSchemas = {
  labels: {
    fields: new Map([
      [
        "id",
        "UUID"
      ],
      [
        "name",
        "VARCHAR"
      ],
      [
        "color",
        "VARCHAR"
      ],
      [
        "project_id",
        "UUID"
      ]
    ]),
    relations: [
      new Relation("projects", "project_id", "id", "projects", "LabelsToProjects", "one"),
      new Relation("task_labels", "", "", "task_labels", "LabelsToTask_labels", "many"),
    ],
    modelSchema: (LabelsCreateInputSchema as any)
      .partial()
      .or((LabelsUncheckedCreateInputSchema as any).partial()),
    createSchema: LabelsCreateArgsSchema,
    createManySchema: LabelsCreateManyArgsSchema,
    findUniqueSchema: LabelsFindUniqueArgsSchema,
    findSchema: LabelsFindFirstArgsSchema,
    updateSchema: LabelsUpdateArgsSchema,
    updateManySchema: LabelsUpdateManyArgsSchema,
    upsertSchema: LabelsUpsertArgsSchema,
    deleteSchema: LabelsDeleteArgsSchema,
    deleteManySchema: LabelsDeleteManyArgsSchema
  } as TableSchema<
    z.infer<typeof LabelsUncheckedCreateInputSchema>,
    Prisma.LabelsCreateArgs['data'],
    Prisma.LabelsUpdateArgs['data'],
    Prisma.LabelsFindFirstArgs['select'],
    Prisma.LabelsFindFirstArgs['where'],
    Prisma.LabelsFindUniqueArgs['where'],
    Omit<Prisma.LabelsInclude, '_count'>,
    Prisma.LabelsFindFirstArgs['orderBy'],
    Prisma.LabelsScalarFieldEnum,
    LabelsGetPayload
  >,
  projects: {
    fields: new Map([
      [
        "id",
        "UUID"
      ],
      [
        "slug",
        "VARCHAR"
      ],
      [
        "name",
        "VARCHAR"
      ],
      [
        "color",
        "VARCHAR"
      ],
      [
        "workspace_id",
        "VARCHAR"
      ],
      [
        "created_at",
        "TIMESTAMP"
      ],
      [
        "created_by",
        "VARCHAR"
      ],
      [
        "modified_at",
        "TIMESTAMP"
      ],
      [
        "modified_by",
        "VARCHAR"
      ]
    ]),
    relations: [
      new Relation("labels", "", "", "labels", "LabelsToProjects", "many"),
      new Relation("tasks", "", "", "tasks", "ProjectsToTasks", "many"),
    ],
    modelSchema: (ProjectsCreateInputSchema as any)
      .partial()
      .or((ProjectsUncheckedCreateInputSchema as any).partial()),
    createSchema: ProjectsCreateArgsSchema,
    createManySchema: ProjectsCreateManyArgsSchema,
    findUniqueSchema: ProjectsFindUniqueArgsSchema,
    findSchema: ProjectsFindFirstArgsSchema,
    updateSchema: ProjectsUpdateArgsSchema,
    updateManySchema: ProjectsUpdateManyArgsSchema,
    upsertSchema: ProjectsUpsertArgsSchema,
    deleteSchema: ProjectsDeleteArgsSchema,
    deleteManySchema: ProjectsDeleteManyArgsSchema
  } as TableSchema<
    z.infer<typeof ProjectsUncheckedCreateInputSchema>,
    Prisma.ProjectsCreateArgs['data'],
    Prisma.ProjectsUpdateArgs['data'],
    Prisma.ProjectsFindFirstArgs['select'],
    Prisma.ProjectsFindFirstArgs['where'],
    Prisma.ProjectsFindUniqueArgs['where'],
    Omit<Prisma.ProjectsInclude, '_count'>,
    Prisma.ProjectsFindFirstArgs['orderBy'],
    Prisma.ProjectsScalarFieldEnum,
    ProjectsGetPayload
  >,
  task_labels: {
    fields: new Map([
      [
        "task_id",
        "UUID"
      ],
      [
        "label_id",
        "UUID"
      ]
    ]),
    relations: [
      new Relation("labels", "label_id", "id", "labels", "LabelsToTask_labels", "one"),
      new Relation("tasks", "task_id", "id", "tasks", "Task_labelsToTasks", "one"),
    ],
    modelSchema: (Task_labelsCreateInputSchema as any)
      .partial()
      .or((Task_labelsUncheckedCreateInputSchema as any).partial()),
    createSchema: Task_labelsCreateArgsSchema,
    createManySchema: Task_labelsCreateManyArgsSchema,
    findUniqueSchema: Task_labelsFindUniqueArgsSchema,
    findSchema: Task_labelsFindFirstArgsSchema,
    updateSchema: Task_labelsUpdateArgsSchema,
    updateManySchema: Task_labelsUpdateManyArgsSchema,
    upsertSchema: Task_labelsUpsertArgsSchema,
    deleteSchema: Task_labelsDeleteArgsSchema,
    deleteManySchema: Task_labelsDeleteManyArgsSchema
  } as TableSchema<
    z.infer<typeof Task_labelsUncheckedCreateInputSchema>,
    Prisma.Task_labelsCreateArgs['data'],
    Prisma.Task_labelsUpdateArgs['data'],
    Prisma.Task_labelsFindFirstArgs['select'],
    Prisma.Task_labelsFindFirstArgs['where'],
    Prisma.Task_labelsFindUniqueArgs['where'],
    Omit<Prisma.Task_labelsInclude, '_count'>,
    Prisma.Task_labelsFindFirstArgs['orderBy'],
    Prisma.Task_labelsScalarFieldEnum,
    Task_labelsGetPayload
  >,
  task_users: {
    fields: new Map([
      [
        "task_id",
        "UUID"
      ],
      [
        "user_id",
        "UUID"
      ],
      [
        "role",
        "VARCHAR"
      ]
    ]),
    relations: [
      new Relation("tasks", "task_id", "id", "tasks", "Task_usersToTasks", "one"),
    ],
    modelSchema: (Task_usersCreateInputSchema as any)
      .partial()
      .or((Task_usersUncheckedCreateInputSchema as any).partial()),
    createSchema: Task_usersCreateArgsSchema,
    createManySchema: Task_usersCreateManyArgsSchema,
    findUniqueSchema: Task_usersFindUniqueArgsSchema,
    findSchema: Task_usersFindFirstArgsSchema,
    updateSchema: Task_usersUpdateArgsSchema,
    updateManySchema: Task_usersUpdateManyArgsSchema,
    upsertSchema: Task_usersUpsertArgsSchema,
    deleteSchema: Task_usersDeleteArgsSchema,
    deleteManySchema: Task_usersDeleteManyArgsSchema
  } as TableSchema<
    z.infer<typeof Task_usersUncheckedCreateInputSchema>,
    Prisma.Task_usersCreateArgs['data'],
    Prisma.Task_usersUpdateArgs['data'],
    Prisma.Task_usersFindFirstArgs['select'],
    Prisma.Task_usersFindFirstArgs['where'],
    Prisma.Task_usersFindUniqueArgs['where'],
    Omit<Prisma.Task_usersInclude, '_count'>,
    Prisma.Task_usersFindFirstArgs['orderBy'],
    Prisma.Task_usersScalarFieldEnum,
    Task_usersGetPayload
  >,
  tasks: {
    fields: new Map([
      [
        "id",
        "UUID"
      ],
      [
        "slug",
        "VARCHAR"
      ],
      [
        "markdown",
        "VARCHAR"
      ],
      [
        "summary",
        "VARCHAR"
      ],
      [
        "type",
        "VARCHAR"
      ],
      [
        "impact",
        "INT4"
      ],
      [
        "status",
        "INT4"
      ],
      [
        "project_id",
        "UUID"
      ],
      [
        "created_at",
        "TIMESTAMP"
      ],
      [
        "created_by",
        "VARCHAR"
      ],
      [
        "assigned_by",
        "VARCHAR"
      ],
      [
        "assigned_at",
        "TIMESTAMP"
      ],
      [
        "modified_at",
        "TIMESTAMP"
      ],
      [
        "modified_by",
        "VARCHAR"
      ],
      [
        "sort_order",
        "INT4"
      ]
    ]),
    relations: [
      new Relation("task_labels", "", "", "task_labels", "Task_labelsToTasks", "many"),
      new Relation("task_users", "", "", "task_users", "Task_usersToTasks", "many"),
      new Relation("projects", "project_id", "id", "projects", "ProjectsToTasks", "one"),
    ],
    modelSchema: (TasksCreateInputSchema as any)
      .partial()
      .or((TasksUncheckedCreateInputSchema as any).partial()),
    createSchema: TasksCreateArgsSchema,
    createManySchema: TasksCreateManyArgsSchema,
    findUniqueSchema: TasksFindUniqueArgsSchema,
    findSchema: TasksFindFirstArgsSchema,
    updateSchema: TasksUpdateArgsSchema,
    updateManySchema: TasksUpdateManyArgsSchema,
    upsertSchema: TasksUpsertArgsSchema,
    deleteSchema: TasksDeleteArgsSchema,
    deleteManySchema: TasksDeleteManyArgsSchema
  } as TableSchema<
    z.infer<typeof TasksUncheckedCreateInputSchema>,
    Prisma.TasksCreateArgs['data'],
    Prisma.TasksUpdateArgs['data'],
    Prisma.TasksFindFirstArgs['select'],
    Prisma.TasksFindFirstArgs['where'],
    Prisma.TasksFindUniqueArgs['where'],
    Omit<Prisma.TasksInclude, '_count'>,
    Prisma.TasksFindFirstArgs['orderBy'],
    Prisma.TasksScalarFieldEnum,
    TasksGetPayload
  >,
}

export const schema = new DbSchema(tableSchemas, migrations)
export type Electric = ElectricClient<typeof schema>
