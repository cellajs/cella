import { Button } from '../ui/button';
import { TaskCard } from './task-card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import CreateStoryForm, { type Story } from './task-card-form';
import type { UniqueIdentifier } from '@dnd-kit/core';
import type { Task } from '~/mocks/dataGeneration';

interface StoriesContextType {
  stories: Task[];
  storiesType: 'inWork' | 'accepted' | 'iced';
  foldedTasks: UniqueIdentifier[];
  toggleTask: (id: UniqueIdentifier) => void;
  isStoriesShown?: boolean;
  handleShowHideClick?: () => void;
  showCreationForm?: boolean;
  creationCallback?: (story: Story) => void;
}

const StoriesContext = ({
  stories,
  storiesType,
  isStoriesShown = true,
  handleShowHideClick,
  showCreationForm,
  creationCallback,
  toggleTask,
  foldedTasks,
}: StoriesContextType) => {
  return (
    <>
      {storiesType !== 'inWork' && stories.length > 0 && (
        <Button
          onClick={handleShowHideClick}
          variant="secondary"
          size="sm"
          className={`w-full rounded-none gap-1 border-none opacity-75 hover:opacity-100 ${
            storiesType === 'accepted' ? 'text-success' : 'text-sky-600'
          } text-sm -mt-[1px]`}
        >
          <span className="text-[12px]">{`${isStoriesShown ? 'Hide' : 'Show'} ${stories.length} ${storiesType} stories`}</span>
          {isStoriesShown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </Button>
      )}
      {storiesType === 'inWork' && showCreationForm && <CreateStoryForm callback={creationCallback} />}
      {isStoriesShown && (
        <>
          {stories.map((task) => (
            <TaskCard isViewState={!foldedTasks.includes(task.id)} toggleTaskClick={toggleTask} task={task} user={task.assignedTo} key={task.id} />
          ))}
        </>
      )}
    </>
  );
};

export default StoriesContext;
