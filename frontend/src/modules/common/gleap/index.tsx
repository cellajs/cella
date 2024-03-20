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
  return <></>;
};

export default GleapSupport;
