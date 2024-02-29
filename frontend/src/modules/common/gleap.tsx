import Gleap from 'gleap';
import { config } from 'config';

Gleap.initialize(config.gleapToken);

const GleapSupport = () => {
  console.log('Gleap initialized');
  return (<></>);
};

export default GleapSupport;
