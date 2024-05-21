// @ts-nocheck
import { z } from 'zod';
import type { Prisma } from './prismaClient';
import { type TableSchema, DbSchema, ElectricClient, type HKT } from 'electric-sql/client/model';
import migrations from './migrations';
import pgMigrations from './pg-migrations';

/////////////////////////////////////////
// HELPER FUNCTIONS
/////////////////////////////////////////


/////////////////////////////////////////
// ENUMS
/////////////////////////////////////////

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted','ReadCommitted','RepeatableRead','Serializable']);

export const LabelsScalarFieldEnumSchema = z.enum(['id','name','color','project_id']);

export const TasksScalarFieldEnumSchema = z.enum(['id','slug','markdown','summary','type','impact','sort_order','status','project_id','created_at','created_by','assigned_by','assigned_at','modified_at','modified_by']);

export const SortOrderSchema = z.enum(['asc','desc']);

export const QueryModeSchema = z.enum(['default','insensitive']);

export const NullsOrderSchema = z.enum(['first','last']);
/////////////////////////////////////////
// MODELS
/////////////////////////////////////////

/////////////////////////////////////////
// LABELS SCHEMA
/////////////////////////////////////////

export const LabelsSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  project_id: z.string(),
})

export type Labels = z.infer<typeof LabelsSchema>

/////////////////////////////////////////
// TASKS SCHEMA
/////////////////////////////////////////

export const TasksSchema = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string(),
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

export const LabelsSelectSchema: z.ZodType<Prisma.LabelsSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  color: z.boolean().optional(),
  project_id: z.boolean().optional(),
}).strict()

// TASKS
//------------------------------------------------------

export const TasksSelectSchema: z.ZodType<Prisma.TasksSelect> = z.object({
  id: z.boolean().optional(),
  slug: z.boolean().optional(),
  markdown: z.boolean().optional(),
  summary: z.boolean().optional(),
  type: z.boolean().optional(),
  impact: z.boolean().optional(),
  sort_order: z.boolean().optional(),
  status: z.boolean().optional(),
  project_id: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  assigned_by: z.boolean().optional(),
  assigned_at: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
}).strict()

// CREATE MANY LABELS AND RETURN OUTPUT TYPE
//------------------------------------------------------

export const CreateManyLabelsAndReturnOutputTypeSelectSchema: z.ZodType<Prisma.CreateManyLabelsAndReturnOutputTypeSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  color: z.boolean().optional(),
  project_id: z.boolean().optional(),
}).strict()

// CREATE MANY TASKS AND RETURN OUTPUT TYPE
//------------------------------------------------------

export const CreateManyTasksAndReturnOutputTypeSelectSchema: z.ZodType<Prisma.CreateManyTasksAndReturnOutputTypeSelect> = z.object({
  id: z.boolean().optional(),
  slug: z.boolean().optional(),
  markdown: z.boolean().optional(),
  summary: z.boolean().optional(),
  type: z.boolean().optional(),
  impact: z.boolean().optional(),
  sort_order: z.boolean().optional(),
  status: z.boolean().optional(),
  project_id: z.boolean().optional(),
  created_at: z.boolean().optional(),
  created_by: z.boolean().optional(),
  assigned_by: z.boolean().optional(),
  assigned_at: z.boolean().optional(),
  modified_at: z.boolean().optional(),
  modified_by: z.boolean().optional(),
}).strict()


/////////////////////////////////////////
// INPUT TYPES
/////////////////////////////////////////

export const LabelsWhereInputSchema: z.ZodType<Prisma.LabelsWhereInput> = z.object({
  AND: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
}).strict();

export const LabelsOrderByWithRelationInputSchema: z.ZodType<Prisma.LabelsOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const LabelsWhereUniqueInputSchema: z.ZodType<Prisma.LabelsWhereUniqueInput> = z.object({
  id: z.string()
})
.and(z.object({
  id: z.string().optional(),
  AND: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsWhereInputSchema),z.lazy(() => LabelsWhereInputSchema).array() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
}).strict());

export const LabelsOrderByWithAggregationInputSchema: z.ZodType<Prisma.LabelsOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  color: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => LabelsCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => LabelsMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => LabelsMinOrderByAggregateInputSchema).optional()
}).strict();

export const LabelsScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.LabelsScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema),z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema),z.lazy(() => LabelsScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  color: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  project_id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
}).strict();

export const TasksWhereInputSchema: z.ZodType<Prisma.TasksWhereInput> = z.object({
  AND: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableFilterSchema),z.number() ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntFilterSchema),z.number() ]).optional(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const TasksOrderByWithRelationInputSchema: z.ZodType<Prisma.TasksOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  sort_order: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  assigned_at: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  modified_at: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  modified_by: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
}).strict();

export const TasksWhereUniqueInputSchema: z.ZodType<Prisma.TasksWhereUniqueInput> = z.object({
  id: z.string()
})
.and(z.object({
  id: z.string().optional(),
  AND: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => TasksWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => TasksWhereInputSchema),z.lazy(() => TasksWhereInputSchema).array() ]).optional(),
  slug: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableFilterSchema),z.number().int().gte(-2147483648).lte(2147483647) ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableFilterSchema),z.number().int().gte(-2147483648).lte(2147483647) ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntFilterSchema),z.number().int().gte(-2147483648).lte(2147483647) ]).optional(),
  project_id: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableFilterSchema),z.string() ]).optional().nullable(),
}).strict());

export const TasksOrderByWithAggregationInputSchema: z.ZodType<Prisma.TasksOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  sort_order: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  project_id: z.lazy(() => SortOrderSchema).optional(),
  created_at: z.lazy(() => SortOrderSchema).optional(),
  created_by: z.lazy(() => SortOrderSchema).optional(),
  assigned_by: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  assigned_at: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  modified_at: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
  modified_by: z.union([ z.lazy(() => SortOrderSchema),z.lazy(() => SortOrderInputSchema) ]).optional(),
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
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  slug: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  markdown: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  summary: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  impact: z.union([ z.lazy(() => IntNullableWithAggregatesFilterSchema),z.number() ]).optional().nullable(),
  sort_order: z.union([ z.lazy(() => IntNullableWithAggregatesFilterSchema),z.number() ]).optional().nullable(),
  status: z.union([ z.lazy(() => IntWithAggregatesFilterSchema),z.number() ]).optional(),
  project_id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  created_at: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema),z.coerce.date() ]).optional(),
  created_by: z.union([ z.lazy(() => StringWithAggregatesFilterSchema),z.string() ]).optional(),
  assigned_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
  assigned_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_at: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema),z.coerce.date() ]).optional().nullable(),
  modified_by: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema),z.string() ]).optional().nullable(),
}).strict();

export const LabelsCreateInputSchema: z.ZodType<Prisma.LabelsCreateInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string()
}).strict();

export const LabelsUncheckedCreateInputSchema: z.ZodType<Prisma.LabelsUncheckedCreateInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string()
}).strict();

export const LabelsUpdateInputSchema: z.ZodType<Prisma.LabelsUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const LabelsUncheckedUpdateInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const LabelsCreateManyInputSchema: z.ZodType<Prisma.LabelsCreateManyInput> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional().nullable(),
  project_id: z.string()
}).strict();

export const LabelsUpdateManyMutationInputSchema: z.ZodType<Prisma.LabelsUpdateManyMutationInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const LabelsUncheckedUpdateManyInputSchema: z.ZodType<Prisma.LabelsUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  color: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const TasksCreateInputSchema: z.ZodType<Prisma.TasksCreateInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUncheckedCreateInputSchema: z.ZodType<Prisma.TasksUncheckedCreateInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUpdateInputSchema: z.ZodType<Prisma.TasksUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksCreateManyInputSchema: z.ZodType<Prisma.TasksCreateManyInput> = z.object({
  id: z.string(),
  slug: z.string(),
  markdown: z.string().optional().nullable(),
  summary: z.string(),
  type: z.string(),
  impact: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  sort_order: z.number().int().gte(-2147483648).lte(2147483647).optional().nullable(),
  status: z.number().int().gte(-2147483648).lte(2147483647),
  project_id: z.string(),
  created_at: z.coerce.date(),
  created_by: z.string(),
  assigned_by: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  modified_at: z.coerce.date().optional().nullable(),
  modified_by: z.string().optional().nullable()
}).strict();

export const TasksUpdateManyMutationInputSchema: z.ZodType<Prisma.TasksUpdateManyMutationInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const TasksUncheckedUpdateManyInputSchema: z.ZodType<Prisma.TasksUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  slug: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  markdown: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  summary: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  impact: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  sort_order: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.number().int().gte(-2147483648).lte(2147483647),z.lazy(() => IntFieldUpdateOperationsInputSchema) ]).optional(),
  project_id: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  created_at: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  created_by: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  assigned_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  assigned_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_at: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  modified_by: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const StringFilterSchema: z.ZodType<Prisma.StringFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const StringNullableFilterSchema: z.ZodType<Prisma.StringNullableFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const SortOrderInputSchema: z.ZodType<Prisma.SortOrderInput> = z.object({
  sort: z.lazy(() => SortOrderSchema),
  nulls: z.lazy(() => NullsOrderSchema).optional()
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

export const StringWithAggregatesFilterSchema: z.ZodType<Prisma.StringWithAggregatesFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const StringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.StringNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional()
}).strict();

export const IntNullableFilterSchema: z.ZodType<Prisma.IntNullableFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const IntFilterSchema: z.ZodType<Prisma.IntFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntFilterSchema) ]).optional(),
}).strict();

export const DateTimeFilterSchema: z.ZodType<Prisma.DateTimeFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const DateTimeNullableFilterSchema: z.ZodType<Prisma.DateTimeNullableFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const TasksCountOrderByAggregateInputSchema: z.ZodType<Prisma.TasksCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional(),
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
  sort_order: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const TasksMaxOrderByAggregateInputSchema: z.ZodType<Prisma.TasksMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  slug: z.lazy(() => SortOrderSchema).optional(),
  markdown: z.lazy(() => SortOrderSchema).optional(),
  summary: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  impact: z.lazy(() => SortOrderSchema).optional(),
  sort_order: z.lazy(() => SortOrderSchema).optional(),
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
  sort_order: z.lazy(() => SortOrderSchema).optional(),
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
  sort_order: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional()
}).strict();

export const IntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.IntNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional()
}).strict();

export const IntWithAggregatesFilterSchema: z.ZodType<Prisma.IntWithAggregatesFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedIntFilterSchema).optional(),
  _max: z.lazy(() => NestedIntFilterSchema).optional()
}).strict();

export const DateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeWithAggregatesFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional()
}).strict();

export const DateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional()
}).strict();

export const StringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional()
}).strict();

export const NullableStringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableStringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional().nullable()
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

export const DateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.DateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional()
}).strict();

export const NullableDateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableDateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional().nullable()
}).strict();

export const NestedStringFilterSchema: z.ZodType<Prisma.NestedStringFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const NestedStringNullableFilterSchema: z.ZodType<Prisma.NestedStringNullableFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedStringWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringWithAggregatesFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional()
}).strict();

export const NestedIntFilterSchema: z.ZodType<Prisma.NestedIntFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntFilterSchema) ]).optional(),
}).strict();

export const NestedStringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.string().array(),z.lazy(() => ListStringFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  contains: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  startsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  endsWith: z.union([ z.string(),z.lazy(() => StringFieldRefInputSchema) ]).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional()
}).strict();

export const NestedIntNullableFilterSchema: z.ZodType<Prisma.NestedIntNullableFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedDateTimeFilterSchema: z.ZodType<Prisma.NestedDateTimeFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const NestedDateTimeNullableFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedIntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedIntNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional()
}).strict();

export const NestedFloatNullableFilterSchema: z.ZodType<Prisma.NestedFloatNullableFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.number().array(),z.lazy(() => ListFloatFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListFloatFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedIntWithAggregatesFilterSchema: z.ZodType<Prisma.NestedIntWithAggregatesFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  in: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListIntFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => IntFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedIntFilterSchema).optional(),
  _max: z.lazy(() => NestedIntFilterSchema).optional()
}).strict();

export const NestedFloatFilterSchema: z.ZodType<Prisma.NestedFloatFilter> = z.object({
  equals: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  in: z.union([ z.number().array(),z.lazy(() => ListFloatFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.number().array(),z.lazy(() => ListFloatFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.number(),z.lazy(() => FloatFieldRefInputSchema) ]).optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatFilterSchema) ]).optional(),
}).strict();

export const NestedDateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeWithAggregatesFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional()
}).strict();

export const NestedDateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional().nullable(),
  in: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  notIn: z.union([ z.coerce.date().array(),z.lazy(() => ListDateTimeFieldRefInputSchema) ]).optional().nullable(),
  lt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  lte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  gte: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldRefInputSchema) ]).optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional()
}).strict();

/////////////////////////////////////////
// ARGS
/////////////////////////////////////////

export const LabelsFindFirstArgsSchema: z.ZodType<Prisma.LabelsFindFirstArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ LabelsScalarFieldEnumSchema,LabelsScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const LabelsFindFirstOrThrowArgsSchema: z.ZodType<Prisma.LabelsFindFirstOrThrowArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ LabelsScalarFieldEnumSchema,LabelsScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const LabelsFindManyArgsSchema: z.ZodType<Prisma.LabelsFindManyArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ LabelsScalarFieldEnumSchema,LabelsScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const LabelsAggregateArgsSchema: z.ZodType<Prisma.LabelsAggregateArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithRelationInputSchema.array(),LabelsOrderByWithRelationInputSchema ]).optional(),
  cursor: LabelsWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() 

export const LabelsGroupByArgsSchema: z.ZodType<Prisma.LabelsGroupByArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
  orderBy: z.union([ LabelsOrderByWithAggregationInputSchema.array(),LabelsOrderByWithAggregationInputSchema ]).optional(),
  by: LabelsScalarFieldEnumSchema.array(),
  having: LabelsScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() 

export const LabelsFindUniqueArgsSchema: z.ZodType<Prisma.LabelsFindUniqueArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() 

export const LabelsFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.LabelsFindUniqueOrThrowArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() 

export const TasksFindFirstArgsSchema: z.ZodType<Prisma.TasksFindFirstArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ TasksScalarFieldEnumSchema,TasksScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const TasksFindFirstOrThrowArgsSchema: z.ZodType<Prisma.TasksFindFirstOrThrowArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ TasksScalarFieldEnumSchema,TasksScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const TasksFindManyArgsSchema: z.ZodType<Prisma.TasksFindManyArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ TasksScalarFieldEnumSchema,TasksScalarFieldEnumSchema.array() ]).optional(),
}).strict() 

export const TasksAggregateArgsSchema: z.ZodType<Prisma.TasksAggregateArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithRelationInputSchema.array(),TasksOrderByWithRelationInputSchema ]).optional(),
  cursor: TasksWhereUniqueInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() 

export const TasksGroupByArgsSchema: z.ZodType<Prisma.TasksGroupByArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
  orderBy: z.union([ TasksOrderByWithAggregationInputSchema.array(),TasksOrderByWithAggregationInputSchema ]).optional(),
  by: TasksScalarFieldEnumSchema.array(),
  having: TasksScalarWhereWithAggregatesInputSchema.optional(),
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict() 

export const TasksFindUniqueArgsSchema: z.ZodType<Prisma.TasksFindUniqueArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() 

export const TasksFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.TasksFindUniqueOrThrowArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() 

export const LabelsCreateArgsSchema: z.ZodType<Prisma.LabelsCreateArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  data: z.union([ LabelsCreateInputSchema,LabelsUncheckedCreateInputSchema ]),
}).strict() 

export const LabelsUpsertArgsSchema: z.ZodType<Prisma.LabelsUpsertArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
  create: z.union([ LabelsCreateInputSchema,LabelsUncheckedCreateInputSchema ]),
  update: z.union([ LabelsUpdateInputSchema,LabelsUncheckedUpdateInputSchema ]),
}).strict() 

export const LabelsCreateManyArgsSchema: z.ZodType<Prisma.LabelsCreateManyArgs> = z.object({
  data: z.union([ LabelsCreateManyInputSchema,LabelsCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict() 

export const LabelsAndReturnCreateManyArgsSchema: z.ZodType<Prisma.LabelsAndReturnCreateManyArgs> = z.object({
  data: z.union([ LabelsCreateManyInputSchema,LabelsCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict() 

export const LabelsDeleteArgsSchema: z.ZodType<Prisma.LabelsDeleteArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  where: LabelsWhereUniqueInputSchema,
}).strict() 

export const LabelsUpdateArgsSchema: z.ZodType<Prisma.LabelsUpdateArgs> = z.object({
  select: LabelsSelectSchema.optional(),
  data: z.union([ LabelsUpdateInputSchema,LabelsUncheckedUpdateInputSchema ]),
  where: LabelsWhereUniqueInputSchema,
}).strict() 

export const LabelsUpdateManyArgsSchema: z.ZodType<Prisma.LabelsUpdateManyArgs> = z.object({
  data: z.union([ LabelsUpdateManyMutationInputSchema,LabelsUncheckedUpdateManyInputSchema ]),
  where: LabelsWhereInputSchema.optional(),
}).strict() 

export const LabelsDeleteManyArgsSchema: z.ZodType<Prisma.LabelsDeleteManyArgs> = z.object({
  where: LabelsWhereInputSchema.optional(),
}).strict() 

export const TasksCreateArgsSchema: z.ZodType<Prisma.TasksCreateArgs> = z.object({
  select: TasksSelectSchema.optional(),
  data: z.union([ TasksCreateInputSchema,TasksUncheckedCreateInputSchema ]),
}).strict() 

export const TasksUpsertArgsSchema: z.ZodType<Prisma.TasksUpsertArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereUniqueInputSchema,
  create: z.union([ TasksCreateInputSchema,TasksUncheckedCreateInputSchema ]),
  update: z.union([ TasksUpdateInputSchema,TasksUncheckedUpdateInputSchema ]),
}).strict() 

export const TasksCreateManyArgsSchema: z.ZodType<Prisma.TasksCreateManyArgs> = z.object({
  data: z.union([ TasksCreateManyInputSchema,TasksCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict() 

export const TasksAndReturnCreateManyArgsSchema: z.ZodType<Prisma.TasksAndReturnCreateManyArgs> = z.object({
  data: z.union([ TasksCreateManyInputSchema,TasksCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict() 

export const TasksDeleteArgsSchema: z.ZodType<Prisma.TasksDeleteArgs> = z.object({
  select: TasksSelectSchema.optional(),
  where: TasksWhereUniqueInputSchema,
}).strict() 

export const TasksUpdateArgsSchema: z.ZodType<Prisma.TasksUpdateArgs> = z.object({
  select: TasksSelectSchema.optional(),
  data: z.union([ TasksUpdateInputSchema,TasksUncheckedUpdateInputSchema ]),
  where: TasksWhereUniqueInputSchema,
}).strict() 

export const TasksUpdateManyArgsSchema: z.ZodType<Prisma.TasksUpdateManyArgs> = z.object({
  data: z.union([ TasksUpdateManyMutationInputSchema,TasksUncheckedUpdateManyInputSchema ]),
  where: TasksWhereInputSchema.optional(),
}).strict() 

export const TasksDeleteManyArgsSchema: z.ZodType<Prisma.TasksDeleteManyArgs> = z.object({
  where: TasksWhereInputSchema.optional(),
}).strict() 

interface LabelsGetPayload extends HKT {
  readonly _A?: boolean | null | undefined | Prisma.LabelsArgs
  readonly type: Omit<Prisma.LabelsGetPayload<this['_A']>, "Please either choose `select` or `include`">
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
        "project_id",
        "VARCHAR"
      ]
    ]),
    relations: [
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
    never,
    Prisma.LabelsFindFirstArgs['orderBy'],
    Prisma.LabelsScalarFieldEnum,
    LabelsGetPayload
  >,
  tasks: {
    fields: new Map([
      [
        "id",
        "VARCHAR"
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
        "sort_order",
        "INT4"
      ],
      [
        "status",
        "INT4"
      ],
      [
        "project_id",
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
    never,
    Prisma.TasksFindFirstArgs['orderBy'],
    Prisma.TasksScalarFieldEnum,
    TasksGetPayload
  >,
}

export const schema = new DbSchema(tableSchemas, migrations, pgMigrations)
export type Electric = ElectricClient<typeof schema>
