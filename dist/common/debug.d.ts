import { UUID } from '../common/UUID';
export declare const debug: {
    statements: string[];
    dump: () => void;
    on: boolean;
    counter: number;
    map: Map<UUID, number>;
    makingSubquery: boolean;
};
