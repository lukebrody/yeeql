import { useEffect, useMemo, useState } from 'react';
export function useQuery(makeQuery, deps, observe) {
    const query = useMemo(makeQuery, deps);
    const [, setCounter] = useState(0);
    useEffect(() => {
        const observer = (change) => {
            observe?.(change);
            setCounter((counter) => counter + 1);
        };
        query.observe(observer);
        return () => query.unobserve(observer);
    }, deps);
    return query.result;
}
