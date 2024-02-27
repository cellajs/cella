import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getUserBySlugOrId } from '~/api/users';
import { dateShort } from '~/lib/utils';
import { User } from '~/types';

// id, modified, modifiedBy
const Expand = ({ row }: { row: User }) => {
  const [modifier, setModifier] = useState<User | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row.modifiedBy) {
      return;
    }

    setLoading(true);
    getUserBySlugOrId(row.modifiedBy)
      .then((user) => {
        setModifier(user);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [row.modifiedBy]);

  return (
    <div className="leading-normal relative font-light flex flex-col gap-4 sm:flex-row sm:gap-12 p-2">
      <div className="grid gap-1 grid-cols-[auto_auto]">
        <div className="font-medium pr-4">ID</div>
        <div>{row.id}</div>
        <div className="font-medium pr-4">Slug</div>
        <div>{row.slug}</div>
      </div>

      <div className="grid gap-1 grid-cols-[auto_auto]">
        <div className="font-medium pr-4">Modified</div>
        <div>{dateShort(row.modifiedAt)}</div>
        <div className="font-medium pr-4">Modified By</div>
        {loading ? (
          <Loader2 className="animate-spin" size={16} />
        ) : modifier ? (
          <div>
            {modifier.name} ({modifier.email})
          </div>
        ) : (
          <div>Unknown</div>
        )}
      </div>
    </div>
  );
};

export default Expand;
