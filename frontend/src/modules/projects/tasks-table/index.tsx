import { Bird } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { type Task, type Label, useElectric } from '~/modules/common/electric/electrify';
import { useColumns } from './columns';
import HeaderSelectStatus from './status';
import { useLiveQuery } from 'electric-sql/react';
import ColumnsView from '~/modules/common/data-table/columns-view';
import SelectProject from './project';
import BoardHeader from '../board/header/board-header';
import { useSearch } from '@tanstack/react-router';
import { WorkspaceTableRoute, type tasksSearchSchema } from '~/routes/workspaces';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { useDebounce } from '~/hooks/use-debounce';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { useWorkspaceStore } from '~/store/workspace';
import { getTaskOrder } from '../task/helpers';
import { toast } from 'sonner';
import { SelectImpact } from '../task/task-selectors/select-impact';
import { dropdowner } from '~/modules/common/dropdowner/state';
import SetLabels from '../task/task-selectors/select-labels';
import { SelectTaskType } from '../task/task-selectors/select-task-type';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';
import AssignMembers from '../task/task-selectors/select-members';
import type { Member } from '~/types';
import type { TaskImpact, TaskType } from '../task/create-task-form';
import { getMembers } from '~/api/general';

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export default function TasksTable() {
  const search = useSearch({ from: WorkspaceTableRoute.id });

  const { t } = useTranslation();
  const { searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery } = useWorkspaceStore(
    ({ searchQuery, selectedTasks, setSelectedTasks, projects, setSearchQuery }) => ({
      searchQuery,
      selectedTasks,
      setSelectedTasks,
      projects,
      setSearchQuery,
    }),
  );

  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search, 'created_at'));
  const [rows, setRows] = useState<Task[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<number[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // Search query options
  const q = useDebounce(searchQuery, 200);
  const sort = sortColumns[0]?.columnKey as TasksSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as TasksSearch['order'];

  const isFiltered = !!q || selectedStatuses.length > 0 || selectedProjects.length > 0;
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort,
      order,
      project_id: selectedProjects,
      status: selectedStatuses,
    }),
    [q, sort, order, selectedStatuses, selectedProjects],
  );
  useSaveInSearchParams(filters, { sort: 'created_at', order: 'desc' });

  const createLabel = (newLabel: Label) => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));
    // TODO: Implement the following
    // Save the new label to the database
    electric.db.labels.create({ data: newLabel });
  };

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any, taskId: string) => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));
    const db = electric.db;
    if (field === 'assigned_to' && Array.isArray(value)) {
      const assignedTo = value.map((user) => user.id);
      db.tasks.update({
        data: {
          assigned_to: assignedTo,
        },
        where: {
          id: taskId,
        },
      });
      return;
    }

    // TODO: Review this
    if (field === 'labels' && Array.isArray(value)) {
      const labels = value.map((label) => label.id);
      db.tasks.update({
        data: {
          labels,
        },
        where: {
          id: taskId,
        },
      });

      return;
    }
    if (field === 'status') {
      const newOrder = getTaskOrder(tasks.find((t) => t.id === taskId)?.status, value, tasks);
      db.tasks.update({
        data: {
          status: value,
          ...(newOrder && { sort_order: newOrder }),
        },
        where: {
          id: taskId,
        },
      });

      return;
    }

    db.tasks.update({
      data: {
        [field]: value,
      },
      where: {
        id: taskId,
      },
    });
  };

  const handleTaskDeleteClick = (taskId: string) => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));
    electric.db.tasks
      .delete({
        where: {
          id: taskId,
        },
      })
      .then(() => {
        toast.success(t('common:success.delete_resources', { resources: t('common:tasks') }));
      });
  };

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType, task.id)} />;

    if (field === 'impact')
      component = <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)} />;
    else if (field === 'labels')
      component = (
        <SetLabels
          labels={labels}
          value={task.virtualLabels}
          organizationId={task.organization_id}
          projectId={task.project_id}
          changeLabels={(newLabels) => handleChange('labels', newLabels, task.id)}
          createLabel={createLabel}
        />
      );
    else if (field === 'assigned_to')
      component = (
        <AssignMembers
          users={members}
          value={task.virtualAssignedTo}
          changeAssignedTo={(newMembers) => handleChange('assigned_to', newMembers, task.id)}
        />
      );
    else if (field === 'status')
      component = (
        <SelectStatus
          taskStatus={task.status as TaskStatus}
          changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)}
          inputPlaceholder={t('common:placeholder.set_status')}
        />
      );

    return dropdowner(component, { id: `${field}-${task.id}`, trigger, align: ['status', 'assigned_to'].includes(field) ? 'end' : 'start' });
  };

  const [columns, setColumns] = useColumns(handleChange, handleTaskActionClick, handleTaskDeleteClick);

  // TODO: Refactor this when Electric supports count
  const { results: tasks = [], updatedAt } = useLiveQuery(
    electric.db.tasks.liveMany({
      where: {
        project_id: {
          in: selectedProjects.length > 0 ? selectedProjects : projects.map((project) => project.id),
        },
        ...(selectedStatuses.length > 0 && {
          status: {
            in: selectedStatuses,
          },
        }),
        parent_id: null,
        OR: [
          {
            summary: {
              contains: q,
            },
          },
          {
            markdown: {
              contains: q,
            },
          },
        ],
      },
      orderBy: {
        [sort || 'created_at']: order,
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const isLoading = !updatedAt;
  // const onResetFilters = () => {
  //   setSearchQuery('');
  //   setSelectedTasks([]);
  //   setSelectedStatuses([]);
  // };

  const onRowsChange = (changedRows: Task[]) => {
    setRows(changedRows);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedTasks(Array.from(selectedRows));
  };

  const { showingTasks } = useTaskFilters(tasks, true, true, labels, members);

  useEffect(() => {
    if (search.q) {
      setSearchQuery(search.q);
    }
  }, []);

  useEffect(() => {
    const fetchLabelsAndMembers = async () => {
      const mappedProjects = selectedProjects.length > 0 ? selectedProjects : projects.map((project) => project.id);
      const fetchedLabels = await electric.db.labels.findMany({
        where: {
          project_id: {
            in: mappedProjects,
          },
        },
      });
      setLabels(fetchedLabels as Label[]);
      const fetchedMembers = await Promise.all(
        mappedProjects.map((p) => getMembers({ idOrSlug: p, entityType: 'PROJECT' }).then(({ items }) => items)),
      );

      setMembers(fetchedMembers.flat() as Member[]);
    };

    fetchLabelsAndMembers();
  }, [selectedProjects, projects]);

  useEffect(() => {
    if (showingTasks.length > 0) setRows(showingTasks);
  }, [showingTasks]);

  return (
    <>
      <BoardHeader mode="table">
        <HeaderSelectStatus selectedStatuses={selectedStatuses} setSelectedStatuses={setSelectedStatuses} />
        <SelectProject projects={projects} selectedProjects={selectedProjects} setSelectedProjects={setSelectedProjects} />
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      </BoardHeader>
      <DataTable<Task>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 42,
          onRowsChange,
          totalCount: tasks.length,
          isLoading,
          isFiltered,
          selectedRows: new Set<string>(selectedTasks),
          onSelectedRowsChange: handleSelectedRowsChange,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: true,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })} />,
        }}
      />
    </>
  );
}
