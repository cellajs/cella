import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { AttachmentRender } from '~/modules/attachment/render/attachment-render';
import { MAX_ZOOM, MIN_ZOOM } from '~/modules/attachment/render/image-zoom';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#4f46e5"/></svg>`;
const imageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// The Storybook test build does not process Tailwind; these are the utilities the viewer's hit areas depend on.
const layoutCss = `
  .stage { width: 900px; height: 500px; }
  .relative { position: relative; } .absolute { position: absolute; } .bottom-3 { bottom: 0.75rem; }
  .left-1\\/2 { left: 50%; } .z-20 { z-index: 20; } .overflow-hidden { overflow: hidden; }
  .flex { display: flex; } .items-center { align-items: center; } .justify-center { justify-content: center; }
  .h-full { height: 100%; } .w-full { width: 100%; } .max-h-full { max-height: 100%; } .max-w-full { max-width: 100%; }
  .object-contain { object-fit: contain; }
  .pointer-events-none { pointer-events: none; } .pointer-events-auto { pointer-events: auto; }
`;

const onPanStateToggle = fn();
const onBackdropClick = fn();

/** The dialog image viewer: wheel and button zoom, rotation, a pan toggle, reset and letterbox dismiss. */
const meta = {
  title: 'attachment/ImageViewer',
  component: AttachmentRender,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <>
        <style>{layoutCss}</style>
        <Story />
      </>
    ),
  ],
  args: {
    type: 'image/svg+xml',
    url: imageUrl,
    altName: 'attachment',
    imagePanZoom: true,
    showButtons: true,
    itemClassName: 'object-contain',
    containerClassName: 'stage relative flex items-center justify-center overflow-hidden',
    onPanStateToggle,
    onBackdropClick,
  },
  beforeEach: () => {
    onPanStateToggle.mockClear();
    onBackdropClick.mockClear();
  },
} satisfies Meta<typeof AttachmentRender>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Scale and offset of the pan layer's matrix(a, b, c, d, e, f). */
const panLayerOf = (img: HTMLElement) => {
  const layer = img.parentElement as HTMLElement;
  const [scale, , , , x, y] = (layer.style.transform.match(/matrix\(([^)]+)\)/)?.[1] ?? '').split(',').map(Number);
  return { scale, x, y };
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const wheel = async (img: HTMLElement, deltaY: number, init: WheelEventInit = {}) => {
  img.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, ...init }));
  await frame();
};

const drag = async (img: HTMLElement, dx: number, dy: number) => {
  const rect = img.getBoundingClientRect();
  const start = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  img.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...start }));
  await frame();
  const end = { clientX: start.clientX + dx, clientY: start.clientY + dy };
  img.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, ...end }));
  await frame();
  img.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...end }));
  await frame();
};

/** Zoom in, zoom out, rotate, pan toggle, reset: the control bar's buttons in order. */
const controlsOf = (canvasElement: HTMLElement) => {
  const [zoomIn, zoomOut, rotate, pan, reset] = canvasElement.querySelectorAll<HTMLButtonElement>('.bottom-3 button');
  return { zoomIn, zoomOut, rotate, pan, reset };
};

export const Viewer: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const img = await canvas.findByRole('img', { name: 'attachment' });
    const { zoomIn, zoomOut, rotate, pan, reset } = controlsOf(canvasElement);

    await expect(panLayerOf(img)).toEqual({ scale: 1, x: 0, y: 0 });

    await step('wheel and trackpad pinch zoom exponentially around the centre', async () => {
      await wheel(img, -100);
      await expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.2), 3);
      await wheel(img, 100);
      await expect(panLayerOf(img).scale).toBeCloseTo(1, 3);
      // A line-mode wheel counts 16 px per line
      await wheel(img, -3, { deltaMode: WheelEvent.DOM_DELTA_LINE });
      await expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.096), 3);
      await wheel(img, -10, { ctrlKey: true });
      await expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.116), 3);
      await expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 });
    });

    await step('wheel zoom stays within the floor and the ceiling', async () => {
      for (let i = 0; i < 12; i++) await wheel(img, -500);
      await expect(panLayerOf(img).scale).toBe(MAX_ZOOM);
      for (let i = 0; i < 12; i++) await wheel(img, 500);
      await expect(panLayerOf(img).scale).toBe(MIN_ZOOM);
    });

    await step('the zoom buttons step by 0.2', async () => {
      await userEvent.click(reset);
      await userEvent.click(zoomIn);
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(1.2, 3));
      await userEvent.click(zoomOut);
      await userEvent.click(zoomOut);
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(0.8, 3));
    });

    await step('rotate turns the image a quarter per click, back to 0 after four', async () => {
      for (const angle of [90, 180, 270, 0]) {
        await userEvent.click(rotate);
        await expect(img.style.transform).toBe(`rotate(${angle}deg)`);
      }
    });

    await step('dragging does nothing while panning is off', async () => {
      await drag(img, 40, 25);
      await expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 });
    });

    await step('with the pan toggle on, a drag moves the image', async () => {
      await userEvent.click(pan);
      // The toggle reports whether the carousel may take drags: not while panning
      await expect(onPanStateToggle).toHaveBeenLastCalledWith(false);

      await drag(img, 40, 25);
      await expect(panLayerOf(img)).toMatchObject({ x: 40, y: 25 });
      await drag(img, -10, 5);
      await expect(panLayerOf(img)).toMatchObject({ x: 30, y: 30 });

      await userEvent.click(pan);
      await expect(onPanStateToggle).toHaveBeenLastCalledWith(true);
      await drag(img, 40, 25);
      await expect(panLayerOf(img)).toMatchObject({ x: 30, y: 30 });
    });

    await step('reset restores zoom, offset and rotation', async () => {
      await userEvent.click(rotate);
      await userEvent.click(reset);
      await waitFor(() => expect(panLayerOf(img)).toEqual({ scale: 1, x: 0, y: 0 }));
      await expect(img.style.transform).toBe('rotate(0deg)');
    });
  },
};

export const PageScrollWhileHovering: Story = {
  play: async ({ canvasElement }) => {
    const img = await within(canvasElement).findByRole('img', { name: 'attachment' });
    const pageWheel = () => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    };

    await expect(pageWheel()).toBe(false);
    await userEvent.hover(img);
    await expect(pageWheel()).toBe(true);
    await userEvent.unhover(img);
    await expect(pageWheel()).toBe(false);
  },
};

export const BackdropDismiss: Story = {
  play: async ({ canvasElement }) => {
    const img = await within(canvasElement).findByRole('img', { name: 'attachment' });
    const stage = canvasElement.querySelector('.stage') as HTMLElement;
    await waitFor(() => expect(img.getBoundingClientRect().width).toBeGreaterThan(0));

    await userEvent.click(img);
    await expect(onBackdropClick).not.toHaveBeenCalled();

    // The letterbox beside the image belongs to the stage, not to the pan layers above it
    const rect = stage.getBoundingClientRect();
    const letterbox = document.elementFromPoint(rect.left + 5, rect.top + 5) as HTMLElement;
    await expect(letterbox).toBe(stage);
    await userEvent.click(letterbox);
    await expect(onBackdropClick).toHaveBeenCalledTimes(1);
  },
};
