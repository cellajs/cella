export default [
  {
    "statements": [
      "CREATE TABLE \"projects\" (\n  \"id\" TEXT NOT NULL,\n  \"organization_id\" TEXT NOT NULL,\n  \"name\" TEXT NOT NULL,\n  \"description\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"modified_at\" TEXT,\n  \"modified_by\" TEXT,\n  CONSTRAINT \"projects_pkey\" PRIMARY KEY (\"id\")\n) WITHOUT ROWID;\n",
      "CREATE TABLE \"tasks\" (\n  \"id\" TEXT NOT NULL,\n  \"project_id\" TEXT NOT NULL,\n  \"name\" TEXT NOT NULL,\n  \"description\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"modified_at\" TEXT,\n  \"modified_by\" TEXT,\n  CONSTRAINT \"tasks_project_id_fkey\" FOREIGN KEY (\"project_id\") REFERENCES \"projects\" (\"id\") ON DELETE CASCADE,\n  CONSTRAINT \"tasks_pkey\" PRIMARY KEY (\"id\")\n) WITHOUT ROWID;\n",
      "INSERT OR IGNORE INTO _electric_trigger_settings(tablename,flag) VALUES ('main.projects', 1);",
      "DROP TRIGGER IF EXISTS update_ensure_main_projects_primarykey;",
      "CREATE TRIGGER update_ensure_main_projects_primarykey\n  BEFORE UPDATE ON \"main\".\"projects\"\nBEGIN\n  SELECT\n    CASE\n      WHEN old.\"id\" != new.\"id\" THEN\n      \t\tRAISE (ABORT, 'cannot change the value of column id as it belongs to the primary key')\n    END;\nEND;",
      "DROP TRIGGER IF EXISTS insert_main_projects_into_oplog;",
      "CREATE TRIGGER insert_main_projects_into_oplog\n   AFTER INSERT ON \"main\".\"projects\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.projects')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'projects', 'INSERT', json_object('id', new.\"id\"), json_object('created_at', new.\"created_at\", 'created_by', new.\"created_by\", 'description', new.\"description\", 'id', new.\"id\", 'modified_at', new.\"modified_at\", 'modified_by', new.\"modified_by\", 'name', new.\"name\", 'organization_id', new.\"organization_id\"), NULL, NULL);\nEND;",
      "DROP TRIGGER IF EXISTS update_main_projects_into_oplog;",
      "CREATE TRIGGER update_main_projects_into_oplog\n   AFTER UPDATE ON \"main\".\"projects\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.projects')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'projects', 'UPDATE', json_object('id', new.\"id\"), json_object('created_at', new.\"created_at\", 'created_by', new.\"created_by\", 'description', new.\"description\", 'id', new.\"id\", 'modified_at', new.\"modified_at\", 'modified_by', new.\"modified_by\", 'name', new.\"name\", 'organization_id', new.\"organization_id\"), json_object('created_at', old.\"created_at\", 'created_by', old.\"created_by\", 'description', old.\"description\", 'id', old.\"id\", 'modified_at', old.\"modified_at\", 'modified_by', old.\"modified_by\", 'name', old.\"name\", 'organization_id', old.\"organization_id\"), NULL);\nEND;",
      "DROP TRIGGER IF EXISTS delete_main_projects_into_oplog;",
      "CREATE TRIGGER delete_main_projects_into_oplog\n   AFTER DELETE ON \"main\".\"projects\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.projects')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'projects', 'DELETE', json_object('id', old.\"id\"), NULL, json_object('created_at', old.\"created_at\", 'created_by', old.\"created_by\", 'description', old.\"description\", 'id', old.\"id\", 'modified_at', old.\"modified_at\", 'modified_by', old.\"modified_by\", 'name', old.\"name\", 'organization_id', old.\"organization_id\"), NULL);\nEND;",
      "INSERT OR IGNORE INTO _electric_trigger_settings(tablename,flag) VALUES ('main.tasks', 1);",
      "DROP TRIGGER IF EXISTS update_ensure_main_tasks_primarykey;",
      "CREATE TRIGGER update_ensure_main_tasks_primarykey\n  BEFORE UPDATE ON \"main\".\"tasks\"\nBEGIN\n  SELECT\n    CASE\n      WHEN old.\"id\" != new.\"id\" THEN\n      \t\tRAISE (ABORT, 'cannot change the value of column id as it belongs to the primary key')\n    END;\nEND;",
      "DROP TRIGGER IF EXISTS insert_main_tasks_into_oplog;",
      "CREATE TRIGGER insert_main_tasks_into_oplog\n   AFTER INSERT ON \"main\".\"tasks\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.tasks')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'tasks', 'INSERT', json_object('id', new.\"id\"), json_object('created_at', new.\"created_at\", 'created_by', new.\"created_by\", 'description', new.\"description\", 'id', new.\"id\", 'modified_at', new.\"modified_at\", 'modified_by', new.\"modified_by\", 'name', new.\"name\", 'project_id', new.\"project_id\"), NULL, NULL);\nEND;",
      "DROP TRIGGER IF EXISTS update_main_tasks_into_oplog;",
      "CREATE TRIGGER update_main_tasks_into_oplog\n   AFTER UPDATE ON \"main\".\"tasks\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.tasks')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'tasks', 'UPDATE', json_object('id', new.\"id\"), json_object('created_at', new.\"created_at\", 'created_by', new.\"created_by\", 'description', new.\"description\", 'id', new.\"id\", 'modified_at', new.\"modified_at\", 'modified_by', new.\"modified_by\", 'name', new.\"name\", 'project_id', new.\"project_id\"), json_object('created_at', old.\"created_at\", 'created_by', old.\"created_by\", 'description', old.\"description\", 'id', old.\"id\", 'modified_at', old.\"modified_at\", 'modified_by', old.\"modified_by\", 'name', old.\"name\", 'project_id', old.\"project_id\"), NULL);\nEND;",
      "DROP TRIGGER IF EXISTS delete_main_tasks_into_oplog;",
      "CREATE TRIGGER delete_main_tasks_into_oplog\n   AFTER DELETE ON \"main\".\"tasks\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.tasks')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'tasks', 'DELETE', json_object('id', old.\"id\"), NULL, json_object('created_at', old.\"created_at\", 'created_by', old.\"created_by\", 'description', old.\"description\", 'id', old.\"id\", 'modified_at', old.\"modified_at\", 'modified_by', old.\"modified_by\", 'name', old.\"name\", 'project_id', old.\"project_id\"), NULL);\nEND;",
      "DROP TRIGGER IF EXISTS compensation_insert_main_tasks_project_id_into_oplog;",
      "CREATE TRIGGER compensation_insert_main_tasks_project_id_into_oplog\n  AFTER INSERT ON \"main\".\"tasks\"\n  WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.projects') AND\n       1 == (SELECT value from _electric_meta WHERE key == 'compensations')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  SELECT 'main', 'projects', 'COMPENSATION', json_object('id', \"id\"), json_object('id', \"id\"), NULL, NULL\n  FROM \"main\".\"projects\" WHERE \"id\" = new.\"project_id\";\nEND;",
      "DROP TRIGGER IF EXISTS compensation_update_main_tasks_project_id_into_oplog;",
      "CREATE TRIGGER compensation_update_main_tasks_project_id_into_oplog\n   AFTER UPDATE ON \"main\".\"tasks\"\n   WHEN 1 == (SELECT flag from _electric_trigger_settings WHERE tablename == 'main.projects') AND\n        1 == (SELECT value from _electric_meta WHERE key == 'compensations')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  SELECT 'main', 'projects', 'COMPENSATION', json_object('id', \"id\"), json_object('id', \"id\"), NULL, NULL\n  FROM \"main\".\"projects\" WHERE \"id\" = new.\"project_id\";\nEND;"
    ],
    "version": "20240411120942_481"
  }
]