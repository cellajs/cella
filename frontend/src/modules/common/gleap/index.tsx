import { config } from 'config';
import Gleap from 'gleap';
import './style.css';

Gleap.initialize(config.gleapToken);

const GleapSupport = () => {
  console.info('Gleap initialized');
  return <></>;
};

export default GleapSupport;
