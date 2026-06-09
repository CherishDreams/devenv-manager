import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const condaVersionCatalog: EnvironmentVersionCatalog = {
  miniconda: [
    createVersion("conda", "miniconda", "py312", "Miniconda Python 3.12", "stable", "installer"),
    createVersion("conda", "miniconda", "py311", "Miniconda Python 3.11", "stable", "installer"),
  ],
  anaconda: [createVersion("conda", "anaconda", "latest", "Anaconda Distribution", "stable", "installer")],
};
