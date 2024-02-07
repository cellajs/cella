import { Row } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getUserBySlugOrId } from "~/api/users";
import { dateShort } from "~/lib/utils";
import { User } from "~/types";

// id, modified, modifiedBy
const Expand = ({ row }: { row: Row<User> }) => {
    const [modifier, setModifier] = useState<User | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!row.original.modifiedBy) {
            return;
        }

        setLoading(true);
        getUserBySlugOrId(row.original.modifiedBy)
            .then((user) => {
                setModifier(user);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [row.original.modifiedBy]);

    return (
        <div className="flex space-x-4">
            <div className="flex flex-col font-light space-y-2">
                <div className="flex space-x-2">
                    <span className="font-medium">ID</span>
                    <span>{row.original.id}</span>
                </div>
                <div className="flex space-x-2">
                    <span className="font-medium">Modified</span>
                    <span>{dateShort(row.original.modifiedAt)}</span>
                </div>
                <div className="flex space-x-2">
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
        </div>
    );
};

export default Expand;