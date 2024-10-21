ALTER TABLE "tasks" 
ALTER COLUMN "type" 
SET DATA TYPE integer 
USING CASE 
  WHEN "type" = 'feature' THEN 1
  WHEN "type" = 'chore' THEN 2
  WHEN "type" = 'bug' THEN 3
  ELSE NULL  -- You can handle unexpected values as needed
END;
