import { config } from 'config';
import Gleap from 'gleap';
import './style.css';

declare global {
  interface Window {
    Gleap: typeof Gleap;
  }
}

Gleap.initialize(config.gleapToken);

const GleapSupport = () => {
  window.Gleap = Gleap;
  console.info('Gleap initialized');
  return <></>;
};

export default GleapSupport;
