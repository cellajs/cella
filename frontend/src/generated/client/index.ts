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

export const ProjectsScalarFieldEnumSchema = z.enum(['id','organization_id','name','description','created_at','created_by','modified_at','modified_by']);

export const QueryModeSchema = z.enum(['default','insensitive']);

export const SortOrderSchema = z.enum(['asc','desc']);

export const TasksScalarFieldEnumSchema = z.enum(['id','project_id','name','description','created_at','created_by','modified_at','modified_by']);

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted','ReadCommitted','RepeatableRead','Serializable']);
/////////////////////////////////////////
// MODELS
/////////////////////////////////////////

/////////////////////////////////////////
// PROJECTS SCHEMA
/////////////////////////////////////////

export const ProjectsSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
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
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().nullable(),
  modified_by: z.string().nullable(),
})

export type Tasks = z.infer<typeof TasksSchema>

/////////////////////////////////////////
// SELECT & INCLUDE
/////////////////////////////////////////

// PROJECTS
//------------------------------------------------------

export const ProjectsIncludeSchema: z.ZodType<Prisma.ProjectsInclude> = z.object({
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
  tasks: z.boolean().optional(),
}).strict();

export const ProjectsSelectSchema: z.ZodType<Prisma.ProjectsSelect> = z.object({
  id: z.boolean().optional(),
  organization_id: z.boolean().optional(),
  name: z.boolean().optional(),
  description: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
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
  project_id: z.boolean().optional(),
  name: z.boolean().optional(),
  description: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
  projects: z.union([z.boolean(),z.lazy(() => ProjectsArgsSchema)]).optional(),
}).strict()


/////////////////////////////////////////
// INPUT TYPES
/////////////////////////////////////////

export const ProjectsWhereInputSchema: z.ZodType<Prisma.ProjectsWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ProjectsWhereInputSchema),z.lazy(() => ProjectsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProjectsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProjectsWhereInputSchema),z.lazy(() => ProjectsWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  organization_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  tasks: z.lazy(() => TasksListRelationFilterSchema).optional()
}).strict();

export const ProjectsOrderByWithRelationInputSchema: z.ZodType<Prisma.ProjectsOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  organization_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  tasks: z.lazy(() => TasksOrderByRelationAggregateInputSchema).optional()
}).strict();

export const ProjectsWhereUniqueInputSchema: z.ZodType<Prisma.ProjectsWhereUniqueInput> = z.object({
  id: z.string().optional()
}).strict();

export const ProjectsOrderByWithAggregationInputSchema: z.ZodType<Prisma.ProjectsOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  organization_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
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
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  organization_id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  created_at: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const TasksWhereInputSchema: z.ZodType<Prisma.TasksWhereInput> = z.object({
  AND: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  projects: z.union([ z.lazy(() => ProjectsRelationFilterSchema),z.lazy(() => ProjectsWhereInputSchema) ]).optional(),
}).strict();

export const TasksOrderByWithRelationInputSchema: z.ZodType<Prisma.TasksOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  projects: z.lazy(() => ProjectsOrderByWithRelationInputSchema).optional()
}).strict();

export const TasksWhereUniqueInputSchema: z.ZodType<Prisma.TasksWhereUniqueInput> = z.object({
  id: z.string().optional()
}).strict();

export const TasksOrderByWithAggregationInputSchema: z.ZodType<Prisma.TasksOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => TasksCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => TasksMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => TasksMinOrderByAggregateInputSchema).optional()
}).strict();

export const TasksScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.TasksScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => TasksScalarWhereWithAggregatesInputSchema),z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksScalarWhereWithAggregatesInputSchema),z.lazy(() => TasksScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  project_id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  created_at: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const ProjectsCreateInputSchema: z.ZodType<Prisma.ProjectsCreateInput> = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  tasks: z.lazy(() => TasksCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUncheckedCreateInputSchema: z.ZodType<Prisma.ProjectsUncheckedCreateInput> = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  tasks: z.lazy(() => TasksUncheckedCreateNestedManyWithoutProjectsInputSchema).optional()
}).strict();

export const ProjectsUpdateInputSchema: z.ZodType<Prisma.ProjectsUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  tasks: z.lazy(() => TasksUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsUncheckedUpdateInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  tasks: z.lazy(() => TasksUncheckedUpdateManyWithoutProjectsNestedInputSchema).optional()
}).strict();

export const ProjectsCreateManyInputSchema: z.ZodType<Prisma.ProjectsCreateManyInput> = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const ProjectsUpdateManyMutationInputSchema: z.ZodType<Prisma.ProjectsUpdateManyMutationInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ProjectsUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksCreateInputSchema: z.ZodType<Prisma.TasksCreateInput> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable(),
  projects: z.lazy(() => ProjectsCreateNestedOneWithoutTasksInputSchema)
}).strict();

export const TasksUncheckedCreateInputSchema: z.ZodType<Prisma.TasksUncheckedCreateInput> = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUpdateInputSchema: z.ZodType<Prisma.TasksUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  projects: z.lazy(() => ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema).optional()
}).strict();

export const TasksUncheckedUpdateInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksCreateManyInputSchema: z.ZodType<Prisma.TasksCreateManyInput> = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUpdateManyMutationInputSchema: z.ZodType<Prisma.TasksUpdateManyMutationInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateManyInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
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

export const TasksListRelationFilterSchema: z.ZodType<Prisma.TasksListRelationFilter> = z.object({
  every: z.lazy(() => TasksWhereInputSchema).optional(),
  some: z.lazy(() => TasksWhereInputSchema).optional(),
  none: z.lazy(() => TasksWhereInputSchema).optional()
}).strict();

export const TasksOrderByRelationAggregateInputSchema: z.ZodType<Prisma.TasksOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsCountOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  organization_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  organization_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const ProjectsMinOrderByAggregateInputSchema: z.ZodType<Prisma.ProjectsMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  organization_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
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

export const ProjectsRelationFilterSchema: z.ZodType<Prisma.ProjectsRelationFilter> = z.object({
  is: z.lazy(() => ProjectsWhereInputSchema).optional(),
  isNot: z.lazy(() => ProjectsWhereInputSchema).optional()
}).strict();

export const TasksCountOrderByAggregateInputSchema: z.ZodType<Prisma.TasksCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksMaxOrderByAggregateInputSchema: z.ZodType<Prisma.TasksMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksMinOrderByAggregateInputSchema: z.ZodType<Prisma.TasksMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  modified_at: z.lazy(() => SortOrderSchema).optional(),
  modified_by: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.TasksCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const TasksUncheckedCreateNestedManyWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedCreateNestedManyWithoutProjectsInput> = z.object({
  create: z.union([ z.lazy(() => TasksCreateWithoutProjectsInputSchema),z.lazy(() => TasksCreateWithoutProjectsInputSchema).array(),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema),z.lazy(() => TasksUncheckedCreateWithoutProjectsInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema),z.lazy(() => TasksCreateOrConnectWithoutProjectsInputSchema).array() ]).optional(),
  createMany: z.lazy(() => TasksCreateManyProjectsInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => TasksWhereUniqueInputSchema),z.lazy(() => TasksWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const StringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional()
}).strict();

export const NullableStringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableStringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional().nullable()
}).strict();

export const DateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.DateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional()
}).strict();

export const NullableDateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableDateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional().nullable()
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

export const ProjectsUpdateOneRequiredWithoutTasksNestedInputSchema: z.ZodType<Prisma.ProjectsUpdateOneRequiredWithoutTasksNestedInput> = z.object({
  create: z.union([ z.lazy(() => ProjectsCreateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedCreateWithoutTasksInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ProjectsCreateOrConnectWithoutTasksInputSchema).optional(),
  upsert: z.lazy(() => ProjectsUpsertWithoutTasksInputSchema).optional(),
  connect: z.lazy(() => ProjectsWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ProjectsUpdateWithoutTasksInputSchema),z.lazy(() => ProjectsUncheckedUpdateWithoutTasksInputSchema) ]).optional(),
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

export const TasksCreateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUncheckedCreateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedCreateWithoutProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
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
  id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const ProjectsCreateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsCreateWithoutTasksInput> = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const ProjectsUncheckedCreateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUncheckedCreateWithoutTasksInput> = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
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
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ProjectsUncheckedUpdateWithoutTasksInputSchema: z.ZodType<Prisma.ProjectsUncheckedUpdateWithoutTasksInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  organization_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksCreateManyProjectsInputSchema: z.ZodType<Prisma.TasksCreateManyProjectsInput> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateWithoutProjectsInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateWithoutProjectsInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateManyWithoutTasksInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyWithoutTasksInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

/////////////////////////////////////////
// ARGS
/////////////////////////////////////////

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

interface ProjectsGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.ProjectsArgs
  readonly type: Omit<Prisma.ProjectsGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

interface TasksGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.TasksArgs
  readonly type: Omit<Prisma.TasksGetPayload<this['_A']>, "Please either choose `select` or `include`">
}

export const tableSchemas = {
  projects: {
    fields: new Map([
      [
        "id",
        "VARCHAR"
      ],
      [
        "organization_id",
        "VARCHAR"
      ],
      [
        "name",
        "VARCHAR"
      ],
      [
        "description",
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
  tasks: {
    fields: new Map([
      [
        "id",
        "VARCHAR"
      ],
      [
        "project_id",
        "VARCHAR"
      ],
      [
        "name",
        "VARCHAR"
      ],
      [
        "description",
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
