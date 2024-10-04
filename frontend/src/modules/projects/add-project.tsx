import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ChevronRight, Shrub, SquareMousePointer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useFocusById from '~/hooks/use-focus-by-id';
import { dialog } from '~/modules/common/dialoger/state';
import { CreateProjectForm } from '~/modules/projects/create-project-form';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import type { Organization } from '~/types/common';

interface AddProjectsProps {
  organization?: Organization | null;
  callback?: () => void;
  dialog?: boolean;
  mode?: 'create' | 'select' | null;
}

const AddProjects = ({ mode }: AddProjectsProps) => {
  //organization, callback, dialog: isDialog,
  const { t } = useTranslation();

  const [creationMode, setCreationMode] = useState(mode);
  if (!mode) useFocusById('create-project-option');

  const updateMode = (mode: ('create' | 'select')[]) => {
    mode[0] ? setCreationMode(mode[0]) : setCreationMode(null);

    dialog.update('add-projects', {
      title: (
        <div className="flex items-center gap-2">
          {mode[0] ? (
            <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
              {t('common:add_resource', { resource: t('app:projects').toLowerCase() })}
            </button>
          ) : (
            t('common:add_resource', { resource: t('app:projects').toLowerCase() })
          )}
          <AnimatePresence>
            {mode[0] && (
              <motion.span
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              >
                {' '}
                <ChevronRight className="opacity-50" size={16} />
                {mode[0] === 'select' ? t('common:select') : t('common:create')}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      ),
    });
  };

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>
      <AnimatePresence mode="popLayout">
        {!creationMode && (
          <motion.div
            key="initial"
            initial={{ x: 0, scale: 0.9, opacity: 0 }}
            animate={{ x: 0, scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            <ToggleGroup type="multiple" onValueChange={updateMode} className="max-sm:flex-col">
              <ToggleGroupItem size="tile" variant="tile" value="create" aria-label="Create project" className="h-auto" id="create-project-option">
                <Shrub size={48} strokeWidth={1} />
                <div className="flex flex-col p-4">
                  <p className="font-light">{t('app:create_project.text')}</p>
                  <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('common:continue')}</strong>
                    <ChevronRight className="ml-1" size={16} />
                  </div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem size="tile" variant="tile" value="select" aria-label="Select project" className="h-auto">
                <SquareMousePointer size={48} strokeWidth={1} />
                <div className="flex flex-col p-4">
                  <div className="font-light">{t('app:select_project.text')}</div>
                  <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('common:continue')}</strong>
                    <ChevronRight className="ml-1" size={16} />
                  </div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </motion.div>
        )}
        {creationMode && (
          <motion.div key="add-form" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-4">
            {creationMode === 'create' ? <CreateProjectForm dialog /> : <>Not yet ready</>}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};

export default AddProjects;
