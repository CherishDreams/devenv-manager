import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const rubyVersionCatalog: EnvironmentVersionCatalog = {
  rubyinstaller: [
    createVersion("ruby", "rubyinstaller", "3.4.7-1", "RubyInstaller 3.4.7-1", "current", "installer"),
    createVersion("ruby", "rubyinstaller", "3.3.10-1", "RubyInstaller 3.3.10-1", "stable", "installer"),
    createVersion("ruby", "rubyinstaller", "3.2.9-1", "RubyInstaller 3.2.9-1", "stable", "installer"),
  ],
};
