import Gleap from 'gleap';
import { config } from 'config';

Gleap.initialize(config.gleapToken);

const GleapSupport = () => {
  console.info('Gleap initialized');
  return (<></>);
};

export default GleapSupport;
