export class QueryBase {
    constructor() {
        this.observers = new Set();
        this.internalObservers = new Set();
    }
    observe(observer) {
        this.observers.add(observer);
    }
    unobserve(observer) {
        this.observers.delete(observer);
    }
    internalObserve(callback) {
        this.internalObservers.add(callback);
    }
    internalUnobserve(callback) {
        this.internalObservers.delete(callback);
    }
    /**
     * Sequences updating this query's result with internal observers,
     * so that internal observers can start executing based on the query's previous results,
     * and signal by calling `ready()` that they are ready for this query's result to update.
     *
     * `ready` returns the change that was made
     *
     * An internal observer might look like
     * ```
     * query.internalObserve((ready) => {
     *   // something with the old result
     *   const change = ready()
     *   // something with the new result
     * })
     * ```
     *
     * additionally, this method serves as a convenience for calling normal (external) observers
     *
     * @param doChange - updates this query's result
     * @returns a function that sends notifications to observers
     */
    makeChange(doChange) {
        const internalObservers = Array.from(this.internalObservers);
        const internalObserverNotifications = [];
        let change;
        const callObserver = (i) => {
            if (i < internalObservers.length) {
                internalObserverNotifications.push(internalObservers[i](() => callObserver(i + 1)));
            }
            else {
                change = doChange();
            }
            return change;
        };
        callObserver(0);
        return () => {
            this.observers.forEach((callback) => callback(change));
            internalObserverNotifications.forEach((notify) => notify());
        };
    }
}
