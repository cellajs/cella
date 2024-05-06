import { z } from 'zod';
import type { Prisma } from './prismaClient';
import { type TableSchema, DbSchema, Relation, type ElectricClient, type HKT } from 'electric-sql/client/model';
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

export const TasksScalarFieldEnumSchema = z.enum(['id','slug','markdown','summary','type','impact','status','project_id','created_at','created_by','assigned_by','assigned_at','modified_at','modified_by']);

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
})

export type Tasks = z.infer<typeof TasksSchema>

/////////////////////////////////////////
// SELECT & INCLUDE
/////////////////////////////////////////

// LABELS
//------------------------------------------------------

export const LabelsIncludeSchema: z.ZodType<Prisma.LabelsInclude> = z.object({
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
}).strict()

export const LabelsArgsSchema: z.ZodType<Prisma.LabelsArgs> = z.object({
  select: z.lazy(() => LabelsSelectSchema).optional(),
  include: z.lazy(() => LabelsIncludeSchema).optional(),
}).strict();

export const LabelsSelectSchema: z.ZodType<Prisma.LabelsSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  color: z.boolean().optional(),
  project_id: z.boolean().optional(),
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
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

// TASKS
//------------------------------------------------------

export const TasksIncludeSchema: z.ZodType<Prisma.TasksInclude> = z.object({
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
}).strict()

export const TasksArgsSchema: z.ZodType<Prisma.TasksArgs> = z.object({
  select: z.lazy(() => TasksSelectSchema).optional(),
  include: z.lazy(() => TasksIncludeSchema).optional(),
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
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
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
}).strict();

export const LabelsOrderByWithRelationInputSchema: z.ZodType<Prisma.LabelsOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  projects: z.lazy(() => ProjectsOrderByWithRelationInputSchema).optional()
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
}).strict();

export const LabelsCreateInputSchema: z.ZodType<Prisma.LabelsCreateInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutLabelsInputSchema)
}).strict();

export const LabelsUncheckedCreateInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateInput> = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string().uuid()
}).strict();

export const LabelsUpdateInputSchema: z.ZodType<Prisma.LabelsUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutLabelsNestedInputSchema).optional()
}).strict();

export const LabelsUncheckedUpdateInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
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
  modified_by: z.string().optional().nullable()
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
  modified_by: z.string().optional().nullable()
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
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksAvgOrderByAggregateInputSchema: z.ZodType<Prisma.TasksAvgOrderByAggregateInput> = z.object({
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional()
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
  modified_by: z.lazy(() => SortOrderSchema).optional()
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
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksSumOrderByAggregateInputSchema: z.ZodType<Prisma.TasksSumOrderByAggregateInput> = z.object({
  impact: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional()
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

export const ProjectsCreateNestedOneWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsCreateNestedOneWithoutTasksInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutTasksInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional()
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

export const ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema: z.ZodType<Prisma.ProjectsUpdateOneRequiredWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutTasksInputSchema).optional(),
  upsert: z.lazy(() => ProjectsUpsertWithoutTasksInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutTasksInputSchema) ]).optional(),
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

export const LabelsCreateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable()
}).strict();

export const LabelsUncheckedCreateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable()
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
  modified_by: z.string().optional().nullable()
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
  modified_by: z.string().optional().nullable()
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
  modified_by: z.string().optional().nullable()
}).strict();

export const LabelsUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const LabelsUncheckedUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
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
    ],
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    modelSchema: (LabelsCreateInputSchema as any)
      .partial()
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
  } as unknown as TableSchema<
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
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    modelSchema: (ProjectsCreateInputSchema as any)
      .partial()
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
  } as unknown as TableSchema<
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
      ]
    ]),
    relations: [
      new Relation("projects", "project_id", "id", "projects", "ProjectsToTasks", "one"),
    ],
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    modelSchema: (TasksCreateInputSchema as any)
      .partial()
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
  } as unknown as TableSchema<
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
