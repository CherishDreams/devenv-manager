import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const luaVersionCatalog: EnvironmentVersionCatalog = {
  luabinaries: [
    createVersion("lua", "luabinaries", "5.4.8", "Lua 5.4.8", "stable", "archive"),
    createVersion("lua", "luabinaries", "5.4.7", "Lua 5.4.7", "stable", "archive"),
    createVersion("lua", "luabinaries", "5.4.6", "Lua 5.4.6", "stable", "archive"),
  ],
};
