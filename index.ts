import { promises as fs } from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import * as BabelParser from '@babel/parser'
import traverse from '@babel/traverse'
import makeDir from 'make-dir'

async function prompt (msg: string) {
  console.info(msg)
  const answer = await question('> ')
  return answer.trim()
}

async function question (question: string): Promise<string> {
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise((resolve) => {
    readlineInterface.question(question, (answer) => {
      resolve(answer)
      readlineInterface.close()
    })
  })
}

async function getFileList (dirpath: string): Promise<string[]> {
  let fileList: string[] = []
  const files: string[] = await fs.readdir(dirpath)
  for (const file of files) {
    const fp = path.join(dirpath, file)
    const stats = await fs.stat(fp)
    if (stats.isDirectory()) {
      const tempList: string[] = await getFileList(fp)
      fileList = fileList.concat(tempList)
    } else {
      // only vue file.
      if (/.+\.vue$/.test(fp)) fileList.push(fp)
    }
  }
  return new Promise((resolve, reject) => {
    return resolve(fileList)
  })
}

class FileInfo {
  private _path: string
  private _name: string
  private _extension?: string

  constructor (name: string, path: string, extension?: string) {
    this._name = name
    this._path = path
    this._extension = extension
  }

  get path () {
    return this._path
  }

  get name () {
    return this._name
  }

  get extension () {
    return this._extension
  }

  /**
   * From the directory path character string,
   * the character string corresponding to the file name and extension is returned.
   *
   * @param dirPathStr directory path (example: 'hoge/fuga/piyo/target')
   * @return fileName, fileExtension
   */
  public static create (dirPathStr: string): FileInfo {
    let name = ''
    let extension = ''
    const matcher1 = dirPathStr.match(/([^/]+?)?$/)
    if (matcher1 && matcher1[1]) {
      const splitArr = matcher1[1].split('.')
      if (splitArr && splitArr[0]) {
        name = splitArr[0]
        if (splitArr[1]) {
          extension = splitArr[1]
        }
      }
    }

    return new FileInfo(name, dirPathStr, extension)
  }
}

class VueComponentFileFactory {
  public exec (fileStr: string, fileInfo: FileInfo): VueComponentFile {
    let template: string = ''
    let script!: VueComponentScript
    let style: string = ''
    // template extraction
    let matchArr: RegExpMatchArray | null = fileStr.match(/<template.*?>([\s\S]*)<\/template>/)
    if (matchArr && matchArr[1]) template = matchArr[1].concat()
    // script extraction
    matchArr = fileStr.match(/<script.*?>([\s\S]*)<\/script>/)
    if (matchArr && matchArr[1]) {
      const scriptStr = matchArr[1].concat()
      script = new VueComponentScript(scriptStr)
    }
    // style extraction
    matchArr = fileStr.match(/<style.*?>([\s\S]*)<\/style>/)
    if (matchArr && matchArr[1]) style = matchArr[1].concat()

    return new VueComponentFile(fileInfo, template, script, style)
  }
}

class VueComponentInformation {
  private static instance: VueComponentInformation

  private static readonly REPORT_DIR: string = 'tools/UnusedComponentsRemover/report'

  private _vcfList: Array<VueComponentFile> = []
  private _allComponentList: Array<FileInfo> = []
  private _useComponentSet: Set<string> = new Set()
  private _unusedComponentList: Array<FileInfo> = []
  private _removeComponentList: Array<FileInfo> = []

  // eslint-disable-next-line no-useless-constructor
  private constructor () {}

  get vcfList () {
    return this._vcfList
  }

  get unusedComponentList () {
    return this._unusedComponentList
  }

  public static getInstance () {
    if (!VueComponentInformation.instance) {
      VueComponentInformation.instance = new VueComponentInformation()
    }
    return VueComponentInformation.instance
  }

  public update (vcfList: Array<VueComponentFile>): void {
    this._vcfList = vcfList

    let useComponentSet = new Set<string>()
    let allComponentList: Array<FileInfo> = []
    for (const vcf of vcfList) {
      vcf.script.importComponents.forEach(component => {
        useComponentSet.add(component)
      })
      allComponentList.push(vcf.fileInfo)
    }
    this._useComponentSet = useComponentSet
    this._allComponentList = allComponentList
    this._unusedComponentList = allComponentList.filter(component => !useComponentSet.has(component.name))
  }

  public async removeUnusedComponent () {
    for (const component of this._unusedComponentList) {
      await fs.unlink(component.path)
    }
    // Set as an array with deleted components
    this._removeComponentList = this._unusedComponentList.concat()
    this.update(this._vcfList)
  }

  public async createReport (): Promise<string> {
    if (this._removeComponentList.length === 0) {
      throw new Error('The list of removed components needed to create the report is missing.')
    }
    const makeDirPath = await makeDir(VueComponentInformation.REPORT_DIR)
    const reportPath = `${makeDirPath}/${this.dateToStr12HPad0(new Date())}.json`

    await fs.writeFile(reportPath, JSON.stringify(this._removeComponentList, null, 2))

    this._removeComponentList = []
    return reportPath
  }

  /**
   * Date string creation function
   *
   * @param date The Date you want to make a string
   * @param format Format of date string to be output
   * @see https://www.sejuku.net/blog/23064
   */
  private dateToStr12HPad0 (date: Date, format: string = 'YYYYMMDD_hhmmss') {
    var hours = date.getHours()
    var ampm = hours < 12 ? 'AM' : 'PM'
    format = format.replace(/YYYY/g, String(date.getFullYear()))
    format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2))
    format = format.replace(/DD/g, ('0' + date.getDate()).slice(-2))
    format = format.replace(/hh/g, ('0' + hours).slice(-2))
    format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2))
    format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2))
    format = format.replace(/AP/, ampm)
    return format
  }
}

class VueComponentFile {
  private _fileInfo: FileInfo
  private _template: string
  private _script: VueComponentScript
  private _style: string

  public constructor (fileInfo: FileInfo, template: string, script: VueComponentScript, style: string) {
    this._fileInfo = fileInfo
    this._template = template
    this._script = script
    this._style = style
  }

  get fileInfo () {
    return this._fileInfo
  }

  get template () {
    return this._template
  }

  get script () {
    return this._script
  }

  get style () {
    return this._style
  }
}

class VueComponentScript {
  private _scriptText: string
  private _importAll: string[] = []
  private _importComponents: string[] = []

  constructor (scriptText: string) {
    this._scriptText = scriptText
    const ast = BabelParser.parse(scriptText, {
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        [
          'decorators',
          { 'decoratorsBeforeExport': true }
        ]
      ],
      sourceType: 'module'
    })

    let importAll: string[] = []
    traverse(ast, {
      ImportDeclaration (path) {
        importAll.push(path.node.source.value)
      }
    })
    this._importAll = importAll

    let importComponents: string[] = []
    for (const importFile of importAll) {
      const fileNameInfo = FileInfo.create(importFile)
      if (fileNameInfo.extension === 'vue') {
        importComponents.push(fileNameInfo.name)
      }
    }

    this._importComponents = importComponents
  }

  get importComponents () {
    return this._importComponents
  }
}

(async () => {
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  const vueComponentFileFactory: VueComponentFileFactory = new VueComponentFileFactory()
  const vueComponentInfomation = VueComponentInformation.getInstance()

  let files: string[] = await getFileList('src/components')

  let vcfList: VueComponentFile[] = []
  for (const file of files) {
    const fileStr = await fs.readFile(file, 'utf8')
    let fileInfo = FileInfo.create(file)
    const vcf = vueComponentFileFactory.exec(fileStr, fileInfo)
    vcfList.push(vcf)
  }

  vueComponentInfomation.update(vcfList)

  console.info(`All vue component files found: ${vueComponentInfomation.vcfList.length}`)
  console.info(`Unnecessary vue component files: ${vueComponentInfomation.unusedComponentList.length}`)
  const answer: string = await prompt('Are you sure you want to delete it? (y/n)')
  if (answer === 'y') {
    await vueComponentInfomation.removeUnusedComponent()
    const reportPath = await vueComponentInfomation.createReport()
    console.info('completed!')
    console.info('report path:')
    console.info(reportPath)
  } else {
    console.info('do nothing...')
  }
})()
