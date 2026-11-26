import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { type EntityRole, hierarchy } from 'shared';
import { SelectRoles } from '~/modules/common/form-fields/select-roles';

/** A plain member's organization role, the default one: `member` in cella; apps with other vocabularies run this file unchanged. */
const memberRole = hierarchy.getDefaultRole('organization');

const meta = { title: 'common/SelectRoles', component: SelectRoles, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof SelectRoles
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: [],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>([]);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const Preselected: Story = {
  args: {
    value: [memberRole],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>([memberRole]);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const MultipleSelected: Story = {
  args: {
    value: [memberRole, 'admin'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>([memberRole, 'admin']);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const WrappedLayout: Story = {
  args: {
    value: [memberRole],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>([memberRole]);

    return (
      <div className="w-64 rounded-lg border p-4">
        <SelectRoles value={value} onChange={setValue} className="flex-wrap items-start" />
      </div>
    );
  },
};
