import { useState, useEffect, useCallback } from 'react'
import debounce from 'lodash.debounce';

export const useScroll = () => {
  const [state, setState] = useState({
    hasScrolled: false,
    lastScrollTop: 0,
    bodyOffset: document.body.getBoundingClientRect(),
    scrollY: document.body.getBoundingClientRect().top,
    scrollX: document.body.getBoundingClientRect().left,
    scrollDirection: '', // down, up
  })

  const handleScrollEvent = useCallback(() => {
    setState((prevState) => {
      const prevLastScrollTop = prevState.lastScrollTop
      const bodyOffset = document.body.getBoundingClientRect()

      return {
        bodyOffset: bodyOffset,
        scrollY: -bodyOffset.top,
        scrollX: bodyOffset.left,
        scrollDirection: prevLastScrollTop > -bodyOffset.top ? 'down' : 'up',
        lastScrollTop: -bodyOffset.top,
        hasScrolled: true,
      }
    })
  }, [])

  useEffect(() => {
    const scrollListener = () => {
      handleScrollEvent()
    }
    window.addEventListener('scroll', debounce(scrollListener, 200))

    return () => {
      window.removeEventListener('scroll', scrollListener)
    }
  }, [handleScrollEvent])

  return {
    hasScrolled: state.hasScrolled,
    scrollY: state.scrollY,
    scrollX: state.scrollX,
    scrollDirection: state.scrollDirection,
  }
}

export default useScroll