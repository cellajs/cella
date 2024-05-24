CREATE TABLE "tasks" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "markdown" TEXT,
  "summary" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "impact" INTEGER,
  "sort_order" INTEGER,
  "status" INTEGER NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "assigned_by" TEXT,
  "assigned_at" TEXT,
  "modified_at" TEXT,
  "modified_by" TEXT,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
) WITHOUT ROWID;

CREATE TABLE "labels" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "project_id" TEXT NOT NULL,
  CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
) WITHOUT ROWID;