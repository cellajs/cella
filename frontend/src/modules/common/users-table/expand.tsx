import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getUserBySlugOrId } from "~/api/users";
import { dateShort } from "~/lib/utils";
import { User } from "~/types";

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
        <div className="leading-normal relative font-light space-y-2">
            <div className="space-x-2">
                <span className="font-medium">ID</span>
                <span>{row.id}</span>
            </div>
            <div className="space-x-2">
                <span className="font-medium">Modified</span>
                <span>{dateShort(row.modifiedAt)}</span>
            </div>
            <div className="space-x-2">
                <span className="font-medium">Modified By</span>
                {loading ? (
                    <Loader2 className="animate-spin" />
                ) : modifier ? (
                    <span>
                        {modifier.name} ({modifier.email})
                    </span>
                ) : (
                    <span>Unknown</span>
                )}
            </div>
        </div>
    );
};

export default Expand;