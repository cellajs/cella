import * as React from "react"

export const useAutoResize = (ref: React.ForwardedRef<HTMLTextAreaElement>, autoResize: boolean) => {

    const areaRef = React.useRef<HTMLTextAreaElement>(null)

    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    React.useImperativeHandle(ref, () => areaRef.current!);

    React.useEffect(() => {
        const ref = areaRef?.current

        const updateAreaHeight = () => {
            if (ref && autoResize) {
                ref.style.height = "auto"
                ref.style.height = `${ref ? ref.scrollHeight : 0}px`
            }
        }

        updateAreaHeight()

        ref?.addEventListener("input", updateAreaHeight)

        return () => ref?.removeEventListener("input", updateAreaHeight)

    }, [])

    return { areaRef }
}