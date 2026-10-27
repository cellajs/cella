import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { AttachmentRender } from '~/modules/attachment/render/attachment-render';
import { maxZoom, minZoom } from '~/modules/attachment/render/use-pan-zoom';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#4f46e5"/></svg>`;
const imageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const onBackdropClick = fn();

/** The dialog image viewer: wheel and button zoom, rotation, panning while zoomed in, reset and letterbox dismiss. */
const meta = {
  title: 'attachment/ImageViewer',
  component: AttachmentRender,
  parameters: { layout: 'centered' },
  // The viewer is a lazy chunk that a busy dev server can take seconds to transform; loading it before render keeps
  // each first find inside its timeout.
  loaders: [() => import('~/modules/attachment/render/image')],
  args: {
    type: 'image/svg+xml',
    url: imageUrl,
    alt: 'attachment',
    imagePanZoom: true,
    showButtons: true,
    itemClassName: 'object-contain',
    containerClassName: 'stage relative flex h-[500px] w-[900px] items-center justify-center overflow-hidden',
    onBackdropClick,
  },
  beforeEach: () => {
    onBackdropClick.mockClear();
  },
} satisfies Meta<typeof AttachmentRender>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Scale and offset of the pan layer as rendered: the offset lives in CSS variables, so read the computed matrix. */
const panLayerOf = (img: HTMLElement) => {
  const { a: scale, e: x, f: y } = new DOMMatrixReadOnly(getComputedStyle(img.parentElement as HTMLElement).transform);
  return { scale, x, y };
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Client coordinates `dx`/`dy` from the centre of the viewport around the pan layer, where the zoom anchors. */
const fromCentre = (img: HTMLElement, dx = 0, dy = 0) => {
  const rect = ((img.parentElement as HTMLElement).parentElement as HTMLElement).getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2 + dx, clientY: rect.top + rect.height / 2 + dy };
};

/** A wheel tick over the viewport centre unless `init` places it elsewhere. */
const wheel = async (img: HTMLElement, deltaY: number, init: WheelEventInit = {}) => {
  img.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, ...fromCentre(img), ...init }));
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

/** A press and release in place, `dx`/`dy` from the viewport centre. */
const press = async (img: HTMLElement, dx: number, dy: number) => {
  const at = fromCentre(img, dx, dy);
  img.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...at }));
  img.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...at }));
  await frame();
};

/** Zoom in, zoom out, rotate, reset: the control bar's buttons in order. */
const controlsOf = (canvasElement: HTMLElement) => {
  const [zoomIn, zoomOut, rotate, reset] = canvasElement.querySelectorAll<HTMLButtonElement>('.bottom-3 button');
  return { zoomIn, zoomOut, rotate, reset };
};

export const Viewer: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const img = await canvas.findByRole('img', { name: 'attachment' });
    const { zoomIn, zoomOut, rotate, reset } = controlsOf(canvasElement);

    await expect(panLayerOf(img)).toEqual({ scale: 1, x: 0, y: 0 });

    // Wheel and mouse moves are continuous events: React commits them in a scheduler task that can land after the
    // next frame, so every changed value is awaited.
    await step('wheel and trackpad pinch zoom exponentially', async () => {
      await wheel(img, -100);
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.2), 3));
      await wheel(img, 100);
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(1, 3));
      // A line-mode wheel counts 16 px per line
      await wheel(img, -3, { deltaMode: WheelEvent.DOM_DELTA_LINE });
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.096), 3));
      await wheel(img, -10, { ctrlKey: true });
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(Math.exp(0.116), 3));
      await expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 });
    });

    await step('wheel zoom holds the point under the pointer in place, and fit returns to the centre', async () => {
      await userEvent.click(reset);
      const at = fromCentre(img, 100, 50);
      await wheel(img, -100, at);
      // The anchor stays put: offset = anchor * (1 - scale)
      await waitFor(() => expect(panLayerOf(img).x).toBeCloseTo(100 * (1 - Math.exp(0.2)), 3));
      await expect(panLayerOf(img).y).toBeCloseTo(50 * (1 - Math.exp(0.2)), 3);
      await wheel(img, 100, at);
      await waitFor(() => expect(panLayerOf(img).scale).toBeCloseTo(1, 3));
      await expect(panLayerOf(img).x).toBeCloseTo(0, 3);
      await expect(panLayerOf(img).y).toBeCloseTo(0, 3);
    });

    await step('wheel zoom stays within the floor and the ceiling', async () => {
      for (let i = 0; i < 12; i++) await wheel(img, -500);
      await waitFor(() => expect(panLayerOf(img).scale).toBe(maxZoom));
      for (let i = 0; i < 12; i++) await wheel(img, 500);
      await waitFor(() => expect(panLayerOf(img).scale).toBe(minZoom));
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

    await step('at fit or below, a drag or a click leaves the image in place', async () => {
      await drag(img, 40, 25);
      await press(img, 50, 20);
      await expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 });
    });

    await step('zoomed in, a drag moves the image', async () => {
      await userEvent.click(reset);
      await userEvent.click(zoomIn);
      await drag(img, 40, 25);
      await waitFor(() => expect(panLayerOf(img)).toMatchObject({ x: 40, y: 25 }));
      await drag(img, -10, 5);
      await waitFor(() => expect(panLayerOf(img)).toMatchObject({ x: 30, y: 30 }));
    });

    // Panning without a drag (WCAG 2.5.7) and from the keyboard (2.1.1)
    await step('zoomed in, a click brings the clicked point to the centre and the arrow keys pan', async () => {
      await press(img, 50, 20);
      await waitFor(() => expect(panLayerOf(img)).toMatchObject({ x: -20, y: 10 }));
      await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
      await waitFor(() => expect(panLayerOf(img)).toMatchObject({ x: 100, y: 130 }));
    });

    await step('back at fit, the image returns to the centre', async () => {
      await userEvent.click(zoomOut);
      await waitFor(() => expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 }));
    });

    await step('a drag released outside the viewport ends the pan', async () => {
      await userEvent.click(zoomIn);
      // From the viewport's centre, where a press that never moves leaves the offset at 0
      const start = fromCentre(img);
      img.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...start }));
      await frame();
      // The button comes up outside the viewport, which never sees that mouseup
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      await frame();

      // Back over the image with no button held, the pointer moves without dragging the image along
      const back = { clientX: start.clientX + 40, clientY: start.clientY + 25 };
      img.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, ...back }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(panLayerOf(img)).toMatchObject({ x: 0, y: 0 });
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
