import chalk from 'chalk';

import { TaskView } from 'hanji';

class Spinner {
  private offset = 0;
  private readonly iterator: () => void;

  constructor(private readonly frames: string[]) {
    this.iterator = () => {
      this.offset += 1;
      this.offset %= frames.length - 1;
    };
  }

  public tick = () => {
    this.iterator();
  };

  public value = () => {
    return this.frames[this.offset];
  };
}

type ValueOf<T> = T[keyof T];
export type Status = 'inserting' | 'done';

export type State = {
  [key: string]: {
    count: number;
    name: string;
    status: Status;
  };
};

export class Progress extends TaskView {
  private state: State;
  private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
  private timeout: NodeJS.Timeout | undefined;

  constructor(state: State) {
    super();
    this.timeout = setInterval(() => {
      this.spinner.tick();
      this.requestLayout();
    }, 128);
    this.state = state;
    this.on('detach', () => clearInterval(this.timeout));
  }

  public update(stage: string, count: number, status: Status) {
    this.state[stage].count = count;
    this.state[stage].status = status;
    this.requestLayout();
  }

  private formatCount = (count: number) => {
    const width: number = Math.max.apply(
      null,
      Object.values(this.state).map((it) => it.count.toFixed(0).length),
    );

    return count.toFixed(0).padEnd(width, ' ');
  };

  private statusText = (spinner: string, stage: ValueOf<State>) => {
    const { name, count } = stage;
    const isDone = stage.status === 'done';

    const prefix = isDone ? `[${chalk.green('✓')}]` : `[${spinner}]`;

    const formattedCount = this.formatCount(count);
    const suffix = isDone ? `${formattedCount} ${name} inserted` : `${formattedCount} ${name} inserting`;

    return `${prefix} ${suffix}\n`;
  };

  render(): string {
    let info = '';
    const spin = this.spinner.value();
    for (const stage of Object.values(this.state)) {
      info += this.statusText(spin, stage);
    }
    return info;
  }
}
