import { InternalChangeCallback } from './Query'

export abstract class QueryBase<Change> {
	private readonly observers = new Set<(change: Change) => void>()

	observe(observer: (change: Change) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: Change) => void): void {
		this.observers.delete(observer)
	}

	private readonly internalObservers: Set<InternalChangeCallback<Change>> =
		new Set()

	internalObserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.add(callback)
	}

	internalUnobserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.delete(callback)
	}

	protected makeChange(block: () => Change): () => void {
		const internalObservers = Array.from(this.internalObservers)
		const internalObserverNotifications: (() => void)[] = []

		let change: Change
		const callObserver = (i: number) => {
			if (i < internalObservers.length) {
				internalObserverNotifications.push(
					internalObservers[i](() => callObserver(i + 1)),
				)
			} else {
				change = block()
			}
			return change
		}

		callObserver(0)

		return () => {
			this.observers.forEach((callback) => callback(change))
			internalObserverNotifications.forEach((notify) => notify())
		}
	}
}
