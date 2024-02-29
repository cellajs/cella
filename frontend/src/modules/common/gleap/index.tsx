import Gleap from 'gleap';
import { config } from 'config';
import './style.css';

Gleap.initialize(config.gleapToken);

const GleapSupport = () => {
  console.info('Gleap initialized');
  return (<></>);
};

export default GleapSupport;
