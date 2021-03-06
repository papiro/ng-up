const 
  execSync = require("child_process").execSync,
  fs = require("fs"),
  path = require("path"),
  rimraf = require("rimraf"),

  cliArg = process.argv[2],
  project_name = "app", // Hard-coded in angular-cli https://github.com/angular/angular-cli/issues/3095
  angularJson = require(path.join(process.cwd(), "angular.json")),
  firstProject = Object.keys(angularJson.projects)[0],
  // Just use the first project's sourceRoot for simplicity's sake 
  project_path = path.resolve(process.cwd(), angularJson.projects[firstProject].sourceRoot, project_name),
  services_path = path.join(project_path, "services"),
  modules_path = path.join(project_path, "modules")
;

function newService (str) {
  gen("service " + str);
}
function newModule (str, { routing = false, module } = {}) {
  gen("module " + str + 
    ( routing ? " --routing" : "" ) + 
    ( module ? " --module " + module : "" ));
}
function newComponent (str, { module, prefix }) {
  gen("component " + str +
    " --module " + module +
    ( prefix ? " --prefix " + prefix : "" ) +
    " --flat");
}
function gen (str) {
  const cmdStr = "npx ng generate " + str;
  console.log(cmdStr);
  cmd(cmdStr);
}
function cmd (str) {
  try {
    const stdout = execSync(str);
    console.log(stdout.toString());
  } catch (err) {
    console.error(err.stdout.toString());
    console.error(err.error);
    process.exit(1);
  }
}
function moveServices () {
  move("service");
}
function moveModule (module) {
  move(module);
  rewriteComponentImports(module);
}
function moveComponents (module) {
  move("component", module); 
}
function rewriteComponentImports (module) {
  const filepath = path.join(modules_path, module, module + ".module.ts");
  const fd = fs.openSync(filepath, "a+");
  const size = fs.fstatSync(fd).size;
  const fbuff = new Buffer.allocUnsafe(size);

  fs.readSync(fd, fbuff, null, size);
  
  const data = fbuff.toString().replace(/\.\.\/.*\.component/g, match => {
    return "./components/" + match.split("/")[1];
  });

  fs.writeSync(fd, data, 0, 0, "utf8");
}
function move (entity, module) {
  fs.readdirSync(project_path)
    .forEach( filename => {
      const file_path = path.join(project_path, filename);
      const fileParts = filename.split(".");
      if (!~fileParts.indexOf(entity)) return;

      const newPath = entity === "service" 
        ? services_path 
        : entity === "component"
          ? path.join(project_path, module, "components")
          : path.join(modules_path);

      if (entity === "component")
        tryMkdir(newPath);

      console.log("moving ", file_path, " to ", newPath);
      fs.renameSync(file_path, path.join(newPath, filename));
    });
}
function scaffoldDirs () {
  tryMkdir(project_path);
  tryMkdir(services_path);
  tryMkdir(modules_path);
}
function tryMkdir (dir) {
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code !== "EEXIST") // if it exists, we're good to go
      throw e
  }
}
function cleanup () {
  console.log("cleaning ", project_path);
  rimraf.sync(project_path);
}

function main (bp) {
  const { modules, services } = bp;
  scaffoldDirs();
  services && services.forEach(newService);
  moveServices();
  function recurseModulesAndGenerateComponents (modulesObj, parent = null) {
    Object.keys(modulesObj)
      .filter( key => {
        return !~["components", "hasRouting", "import", "prefix"].indexOf(key);
      })
      .forEach( module => {
        const moduleObj = modulesObj[module];
        // empty modules are there for documentation, but shouldn't be scaffolded
        if (Object.keys(moduleObj).length === 0) return;
        const routing = !!moduleObj.hasRouting;
        const importInto = moduleObj.import && parent;
        const prefix = moduleObj.prefix;
        newModule(module, { routing, module: importInto });
        const components = moduleObj.components;
        if (components) {
          components.forEach( component => { newComponent(component,{ module, prefix }) });
          moveComponents(module);
        }
        recurseModulesAndGenerateComponents(moduleObj, module);
        // finally move the module after all is said and done
        moveModule(module);
      });
  }
  recurseModulesAndGenerateComponents(modules);
}

switch (cliArg) {
  case "clean":
    cleanup(); break;
  default:
    main(require(path.resolve(process.cwd(), cliArg)));
}
