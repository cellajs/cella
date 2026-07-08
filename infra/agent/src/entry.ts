import { errorMessage } from '../../lib/utils/errors'
import { main } from './main'

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
