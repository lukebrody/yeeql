# `useQuery(makeQuery: Query, deps, observe?): QueryResult<Query>`

### Function Signature

```typescript
function useQuery<Q extends Query<QueryResult<Q>, QueryChange<Q>>>(
    makeQuery: () => Q,
    deps: React.DependencyList | undefined,
    observe?: (change: QueryChange<Q>) => void
): QueryResult<Q>
```

Use this React hook to easily use Yeeql queries inside React components.

### Example

```typescript
import React from 'react'
import { useQuery, Table } from 'yeeql'

const genusSort = (a: { genus: string }, b: { genus: string }) => a.genus.localeCompare(b.genus)

function DinoListComponent({ diet, dinoTable }: { 
    diet: 'herbivore' | 'carnivore',
    dinoTable: Table<typof dinosaursSchema>
}) {
    const dinos = useQuery(() => dinoTable.query({
        select: ['id', 'genus'],
        filter: { diet }
        sort: genusSort
    }), [diet])

    const dinoNames = dinos.map(dino => (
        <p key={dino.id}>
            ${dino.genus}
        </p>
    ))
    
    return (
        <>
            <h1>
                ${diet}s
            </h1>
            {dinoNames}
        </>
    )
}

<DinoListComponent diet='carnivore'/> // Rendered somewhere

const allosaurusId = dinoTable.insert({ genus: 'Allosaurus', ageInMillionsOfYears: 145, diet: 'carnivore' })
// DinoListComponent re-renders

dinoTable.update(allosaurusId, 'ageInMillionsOfYears', 150)
// DinoListComponent DOES NOT re-render, since 'ageInMillionsOfYears' is not selected in the query

dinoTable.insert({ genus: 'Styracosaurus', ageInMillionsOfYears: 75, diet: 'herbivore' })
// DinoListComponent DOES NOT re-render, since Styracosaurus is not a carnivore

dinoTable.update(allosaurusId, 'genus', 'Allosaurus ❤️')
// DinoListComponent re-renders, since 'genus' is selected
```