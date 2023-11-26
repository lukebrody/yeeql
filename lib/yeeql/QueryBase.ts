import { InternalChangeCallback } from './Query'

export class QueryBase<Change> {

	private readonly observers = new Set<(change: Change) => void>()

	observe(observer: (change: Change) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: Change) => void): void {
		this.observers.delete(observer)
	}

	protected notifyObservers(change: Change): () => void {
		const internalObserverNotifications: (() => void)[] = []
		this.internalObservers.forEach(({ didChange }) => internalObserverNotifications.push(didChange(change)))

		const result: Array<() => void> = []
		result.push(() => this.observers.forEach(observer => observer(change)))
		return () => {
			result.forEach(callback => callback())
			internalObserverNotifications.forEach(notify => notify())
		}
	}

	private readonly internalObservers: Set<InternalChangeCallback<Change>> = new Set()

	internalObserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.add(callback)
	}

	internalUnobserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.delete(callback)
	}

	preChange(): void {
		this.internalObservers.forEach(({ willChange }) => willChange())
	}
}