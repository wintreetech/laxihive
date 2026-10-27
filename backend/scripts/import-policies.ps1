param([Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskBackend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRoot = [IO.Path]::GetFullPath((Join-Path $taskBackend '..'))
$taskSource = Join-Path $taskBackend '.local/policy-import'
$taskOutput = Join-Path $taskRoot 'frontend/src/content'
New-Item -ItemType Directory -Path $taskSource,$taskOutput -Force | Out-Null
$taskWordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$taskRelNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
$taskRoutes = @{
  'LexiHive-Terms-and-Conditions.docx' = @('/terms',0)
  'LexiHive-Privacy-Policy.docx' = @('/privacy',1)
  'LexiHive-Refunds-and-Returns-Policy.docx' = @('/refund-policy',2)
  'LexiHive-Cancellation-Policy.docx' = @('/cancellation-policy',3)
  'LexiHive-Digital-Delivery-and-Access-Policy.docx' = @('/digital-delivery-policy',4)
  'LexiHive-Payment-Method-Policy.docx' = @('/payment-method-policy',5)
  'LexiHive-Virtual-Currency-Policy.docx' = @('/virtual-currency',6)
  'LexiHive-Complaints-and-Disputes-Policy.docx' = @('/complaints-policy',7)
}
function Read-XmlEntry($Archive,[string]$Name) {
  $entry = $Archive.GetEntry($Name)
  if (!$entry) { return $null }
  $reader = New-Object IO.StreamReader($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Read-Inlines($Paragraph,$Namespace,$Relations) {
  foreach($run in $Paragraph.SelectNodes('.//w:r',$Namespace)) {
    $bold = $run.SelectSingleNode('w:rPr/w:b',$Namespace)
    $italic = $run.SelectSingleNode('w:rPr/w:i',$Namespace)
    $link = $run.SelectSingleNode('ancestor::w:hyperlink[1]',$Namespace)
    $href = $null
    if($link) {
      $rid = $link.GetAttribute('id',$taskRelNs)
      if($rid -and $Relations.ContainsKey($rid)) { $href = $Relations[$rid] }
      elseif($link.GetAttribute('anchor',$taskWordNs)) { $href = '#' + $link.GetAttribute('anchor',$taskWordNs) }
    }
    foreach($part in $run.SelectNodes('w:t|w:br|w:cr|w:tab|w:noBreakHyphen|w:softHyphen',$Namespace)) {
      $value = switch($part.LocalName) {
        't' { $part.InnerText }
        'tab' { "`t" }
        'noBreakHyphen' { [string][char]0x2011 }
        'softHyphen' { [string][char]0x00AD }
        default { "`n" }
      }
      if($value.Length -eq 0) { continue }
      [pscustomobject]@{text=$value;bold=([bool]$bold -and $bold.GetAttribute('val',$taskWordNs) -notin @('0','false'));italic=([bool]$italic -and $italic.GetAttribute('val',$taskWordNs) -notin @('0','false'));href=$href}
    }
  }
}
function Read-Paragraph($Paragraph,$Namespace,$Relations) {
  $runs = @(Read-Inlines $Paragraph $Namespace $Relations)
  $text = ($runs | ForEach-Object { $_.text }) -join ''
  if([string]::IsNullOrWhiteSpace($text)) { return }
  $styleNode = $Paragraph.SelectSingleNode('w:pPr/w:pStyle',$Namespace)
  $style = if($styleNode) { $styleNode.GetAttribute('val',$taskWordNs) } else { '' }
  $kind = 'paragraph'; $level = 0
  if($style -eq 'Title') { $kind='title'; $level=1 }
  elseif($style -match '^Heading([1-5])$') { $kind='heading'; $level=1+[int]$matches[1] }
  $id='source-' + $script:taskParagraphNumber; $script:taskParagraphNumber++
  [pscustomobject]@{kind=$kind;id=$id;style=$style;level=$level;text=$text;inlines=$runs}
}
function Read-Blocks($Parent,$Namespace,$Relations) {
  foreach($node in $Parent.ChildNodes) {
    if($node.LocalName -eq 'p') { Read-Paragraph $node $Namespace $Relations }
    elseif($node.LocalName -eq 'tbl') {
      $rows = @()
      foreach($row in $node.SelectNodes('w:tr',$Namespace)) {
        $cells = @()
        foreach($cell in $row.SelectNodes('w:tc',$Namespace)) { $cells += ,([pscustomobject]@{blocks=@(Read-Blocks $cell $Namespace $Relations)}) }
        $rows += ,([pscustomobject]@{cells=$cells})
      }
      [pscustomobject]@{kind='table';rows=$rows}
    }
    elseif($node.LocalName -ne 'sectPr' -and $node.LocalName -ne 'tcPr' -and $node.SelectNodes('.//w:t',$Namespace).Count -gt 0) {
      throw "Unsupported visible policy element: $($node.LocalName). Import stopped to prevent text loss."
    }
  }
}
function Flatten-Text($Blocks) {
  foreach($block in $Blocks) {
    if($block.kind -eq 'table') { foreach($row in $block.rows) { foreach($cell in $row.cells) { Flatten-Text $cell.blocks } } }
    else { $block.text }
  }
}
function Assert-ParagraphText($Xml,$Namespace,$Blocks,[string]$Name) {
  # Independently compare each source paragraph, including whitespace and line breaks.
  $sourceParagraphs=@(foreach($paragraph in $Xml.SelectNodes('//w:p',$Namespace)) {
    $value=(@(foreach($node in $paragraph.SelectNodes('.//w:t|.//w:br|.//w:cr|.//w:tab|.//w:noBreakHyphen|.//w:softHyphen',$Namespace)) {
      switch($node.LocalName) {
        't' { $node.InnerText }
        'tab' { "`t" }
        'noBreakHyphen' { [string][char]0x2011 }
        'softHyphen' { [string][char]0x00AD }
        default { "`n" }
      }
    })) -join ''
    if(![string]::IsNullOrWhiteSpace($value)) { $value }
  })
  $importedParagraphs=@(Flatten-Text $Blocks)
  if($sourceParagraphs.Count -ne $importedParagraphs.Count) { throw "Paragraph count mismatch in $Name" }
  for($i=0;$i -lt $sourceParagraphs.Count;$i++) {
    if($sourceParagraphs[$i] -cne $importedParagraphs[$i]) { throw "Exact paragraph text mismatch in $Name at paragraph $i" }
  }
}
$taskZip=[IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
$taskDocuments=@()
try {
  foreach($entry in $taskZip.Entries | Where-Object { $_.FullName -like '*.docx' }) {
    $name=[IO.Path]::GetFileName($entry.FullName)
    if(!$taskRoutes.ContainsKey($name)) { throw "Unexpected policy document: $name" }
    $destination=[IO.Path]::GetFullPath((Join-Path $taskSource $name))
    if(!$destination.StartsWith($taskSource+[IO.Path]::DirectorySeparatorChar)) { throw 'Invalid archive destination' }
    $memory=New-Object IO.MemoryStream
    $stream=$entry.Open()
    try { $stream.CopyTo($memory) } finally { $stream.Dispose() }
    $bytes=$memory.ToArray()
    [IO.File]::WriteAllBytes($destination,$bytes)
    $hasher=[Security.Cryptography.SHA256]::Create()
    try { $digest=($hasher.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '' } finally { $hasher.Dispose() }
    $memory.Position=0
    $document=New-Object IO.Compression.ZipArchive($memory,[IO.Compression.ZipArchiveMode]::Read)
    try {
      $xml=Read-XmlEntry $document 'word/document.xml'
      $namespace=New-Object Xml.XmlNamespaceManager($xml.NameTable)
      $namespace.AddNamespace('w',$taskWordNs)
      $relations=@{}
      $relXml=Read-XmlEntry $document 'word/_rels/document.xml.rels'
      if($relXml) { foreach($rel in $relXml.SelectNodes('//*[local-name()="Relationship"]')) { $relations[$rel.Id]=[string]$rel.Target } }
      $script:taskParagraphNumber=0
      $blocks=@(Read-Blocks ($xml.SelectSingleNode('//w:body',$namespace)) $namespace $relations)
      Assert-ParagraphText $xml $namespace $blocks $name
      $expected=($xml.SelectNodes('//w:body//w:t',$namespace) | ForEach-Object { $_.InnerText }) -join ''
      $actual=(Flatten-Text $blocks) -join ''
      if(($actual -replace '\s','') -cne ($expected -replace '\s','')) { throw "Body text mismatch in $name" }
      # Owner-requested presentation change: omit the complete LAST UPDATED cell.
      # Every other paragraph still comes from the exactly verified Word content.
      foreach($table in $blocks | Where-Object { $_.kind -eq 'table' }) {
        foreach($row in $table.rows) {
          $row.cells=@($row.cells | Where-Object {
            $cellText=(Flatten-Text $_.blocks) -join "`n"
            $cellText -notmatch '^LAST UPDATED\s+27 October 2026\s*$'
          })
        }
      }
      $footers=@()
      foreach($part in $document.Entries | Where-Object { $_.FullName -match '^word/(header\d+|footer\d+|footnotes|endnotes)\.xml$' } | Sort-Object FullName) {
        $partXml=Read-XmlEntry $document $part.FullName
        $partNs=New-Object Xml.XmlNamespaceManager($partXml.NameTable);$partNs.AddNamespace('w',$taskWordNs)
        $partBlocks=@()
        foreach($paragraph in $partXml.SelectNodes('//w:p',$partNs)) {
          $block=Read-Paragraph $paragraph $partNs @{}
          if($block) { $partBlocks += $block }
        }
        $partExpected=($partXml.SelectNodes('//w:t',$partNs) | ForEach-Object { $_.InnerText }) -join ''
        $partActual=(Flatten-Text $partBlocks) -join ''
        if(($partActual -replace '\s','') -cne ($partExpected -replace '\s','')) { throw "Supplemental text mismatch in $name" }
        Assert-ParagraphText $partXml $partNs $partBlocks "$name / $($part.FullName)"
        $footers += $partBlocks
      }
      $title=($blocks | Where-Object {$_.kind -eq 'title'} | Select-Object -First 1).text
      if(!$title) { throw "Missing title in $name" }
      $publishedText=@(Flatten-Text $blocks)+@(Flatten-Text $footers)
      $taskDocuments += [pscustomobject]@{path=$taskRoutes[$name][0];order=$taskRoutes[$name][1];title=$title;sourceFile=$name;sourceSha256=$digest;blocks=$blocks;footers=$footers;paragraphCount=$publishedText.Count;sourceText=$publishedText}
      Write-Output ("Imported {0}: {1} published paragraphs; source verified, requested date removed" -f $title,$publishedText.Count)
    } finally { $document.Dispose(); $memory.Dispose() }
  }
} finally { $taskZip.Dispose() }
if($taskDocuments.Count -ne 8) { throw 'Expected all eight policy documents' }
$taskDocuments=@($taskDocuments | Sort-Object order)
$taskEncoding=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $taskOutput 'policies.json'),(ConvertTo-Json -InputObject $taskDocuments -Depth 70),$taskEncoding)
$taskIndex=@($taskDocuments | Select-Object path,title,sourceFile,sourceSha256,paragraphCount)
[IO.File]::WriteAllText((Join-Path $taskOutput 'policy-index.json'),(ConvertTo-Json -InputObject $taskIndex -Depth 5),$taskEncoding)
