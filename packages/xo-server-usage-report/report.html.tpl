<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Xen Orchestra − Usage Report − {{style.currDate}}</title>
  <style>
    html, body {
      font-family: 'Legacy',sans-serif;
    }

    .page:not(:first-child) {
      page-break-before: always;
    }

    table {
      page-break-inside: avoid;
    }

    #pageHeader .logo {
      overflow:auto;
      float: left;
      width: 300px;
    }

    #pageHeader .logo img {
      width: 50px;;
      height: 50px;
      float: left;
    }

    #pageHeader .logo label {
      font-weight: 450;
      font-size: 28px;
      color: #171717;
      margin-top:8px;
      margin-left: 5px;
      display:inline-block;
    }

    #pageHeader .date {
      float: right;
      margin-right: 10px;
      margin-top:12px;
    }

    #pageHeader .date span {
      font-size: 20px;
    }

    #pageHeader hr {
      margin-top: 7%;
    }

    .page .global {
      border-collapse: collapse;
      margin: auto;
      border: 1px solid #95a5a6;
    }

    .page .global  tr:nth-child(1) td {
      border: 1px solid #95a5a6;
      padding: 15px;
      font-size: 35px;
      background-color: #95a5a6;
      color: #ecf0f1;
      text-shadow: 1px 0px 0px #ecf0f1;
      text-align: center;
    }

    .page .global tr td:not(#title) {
      margin-left:10px;
      padding: 10px;
      font-size: 12px;
    }

    .page .global tr td:nth-child(1):not(#title) {
      font-weight: 600;
      font-size: 12px;
    }

    .page .global tr:nth-child(2) td {
      border-top: 1px solid #95a5a6;
    }

    .page .global tr:nth-last-child(2) td {
      border-bottom: 1px solid #95a5a6;
    }

    .top table{
      margin: auto;
      margin-top: 60px;
      width: 400px;
    }

    .top table caption {
      border: 1px solid #95a5a6;
      font-size: 18px;
      background-color: #95a5a6;
      color: #ecf0f1;
      text-shadow: 1px 0px 0px #ecf0f1;
      text-align: center;
      height: 30px;
      line-height:30px;
    }

    .top table .tableHeader{
      background-color: #DCDDDE;
      text-align: center;
      font-size: 16px;
      width: 60px;
    }

    .top table th {
      background-color: #DCDDDE;
    }

    .top table td:not(.tableHeader){
      padding: 10px;
      font-size: 13px;
      border:1px solid #95a5a6;
      text-align: center;
    }
  </style>
</head>
<body>

    <div id="pageHeader">
      <div class="logo">
        <img src="{{style.imgXo}}" alt= "Xo Logo"> <label>XOA</label>
      </div>
      <div class="date">
          <span>{{#if style.prevDate}} {{style.prevDate}} {{else}} 0000-00-00 {{/if}}</span> - <span>{{style.currDate}}</span>
      </div>
        <br>
        <hr color="#95a5a6" size="1px"/>
    </div>

    {{!-- Do not use the footer for pure HTML version
    <div id="pageFooter"  align="center">
      <hr color="#95a5a6" size="1px"/>
      <span style="color:#7f8c8d">-{{style.page}}-</span>
    </div>
    --}}

    <div class="page">

      <table class ="global">
        <tr>
          <td id="title" rowspan="13">VM</td>
        </tr>
        <tr>
          <td>Number:</td>
          <td>{{global.vms.number}}</td>
          <td>
            {{#if global.vmsEvolution.number}}
              {{#compare global.vmsEvolution.number ">" 0}}+{{/compare}}
              {{global.vmsEvolution.number}}
            {{else}}
              0
            {{/if}}
          </td>
        </tr>
        <tr>
          <td>CPU:</td>
          <td>{{global.vms.cpu}} %</td> <!-- One condition doesn't work -->
          <td style='color:{{#compare global.vmsEvolution.cpu ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.cpu}}
              {{#compare global.vmsEvolution.cpu ">" 0}}+{{/compare}}
              {{global.vmsEvolution.cpu}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>RAM:</td>
          <td>{{global.vms.ram}} GiB</td>
          <td style='color:{{#compare global.vmsEvolution.ram ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.ram}}
              {{#compare global.vmsEvolution.ram ">" 0}}+{{/compare}}
              {{global.vmsEvolution.ram}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Disk read:</td>
          <td>{{global.vms.diskRead}} MiB</td>
          <td style='color:{{#compare global.vmsEvolution.diskRead ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.diskRead}}
              {{#compare global.vmsEvolution.diskRead ">" 0}}+{{/compare}}
              {{global.vmsEvolution.diskRead}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Disk write:</td>
          <td>{{global.vms.diskWrite}} MiB</td>
          <td style='color:{{#compare global.vmsEvolution.diskWrite ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.diskWrite}}
              {{#compare global.vmsEvolution.diskWrite ">" 0}}+{{/compare}}
              {{global.vmsEvolution.diskWrite}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Net reception:</td>
          <td>{{global.vms.netReception}} KiB</td>
          <td style='color:{{#compare global.vmsEvolution.netReception ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.netReception}}
              {{#compare global.vmsEvolution.netReception ">" 0}}+{{/compare}}
              {{global.vmsEvolution.netReception}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Net transmission:</td>
          <td>{{global.vms.netTransmission}} KiB</td>
          <td style='color:{{#compare global.vmsEvolution.netTransmission ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.vmsEvolution.netTransmission}}
              {{#compare global.vmsEvolution.netTransmission ">" 0}}+{{/compare}}
              {{global.vmsEvolution.netTransmission}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
      </table>

      <div class="top">

        <table>
          <caption>3rd top usages</caption>
          <tr>
            <th></th>
            <th>UUID</th>
            <th>Name</th>
            <th>Value</th>
          </tr>

          <tr>
            <td rowspan='{{math topVms.cpu.length "+" 1}}' class="tableHeader">CPU</td>
          </tr>
          {{#each topVms.cpu}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} %</td>
          </tr>
          {{/each}}

          <tr>
            <td rowspan='{{math topVms.ram.length "+" 1}}' class="tableHeader">RAM</td>
          </tr>
          {{#each topVms.ram}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} GiB</td>
          </tr>
          {{/each}}
        </table>
        <table>
          <caption>3rd top usages</caption>
          <tr>
            <th></th>
            <th>UUID</th>
            <th>Name</th>
            <th>Value</th>
          </tr>
          <tr>
            <td rowspan='{{math topVms.diskRead.length "+" 1}}' class="tableHeader">Disk read</td>
          </tr>
          {{#each topVms.diskRead}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} MiB</td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topVms.diskWrite.length "+" 1}}' class="tableHeader">Disk write</td>
          </tr>
          {{#each topVms.diskWrite}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} MiB</td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topVms.netReception.length "+" 1}}' class="tableHeader">Net reception</td>
          </tr>
          {{#each topVms.netReception}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} KiB</td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topVms.netTransmission.length "+" 1}}' class="tableHeader">Net transmission</td>
          </tr>
          {{#each topVms.netTransmission}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} KiB</td>
          </tr>
          {{/each}}
        </table>
      </div>
    </div>

    <div class="page">
      <table class ="global">
        <tr>
          <td id="title" rowspan="13">Host</td>
        </tr>
        <tr>
          <td>Number:</td>
          <td>{{global.hosts.number}}</td>
          <td>
            {{#if global.hostsEvolution.number}}
              {{#compare global.hostsEvolution.number ">" 0}}+{{/compare}}
              {{global.hostsEvolution.number}}
            {{else}}
              0
            {{/if}}
          </td>
        </tr>
        <tr>
          <td>CPU:</td>
          <td>{{global.hosts.cpu}} %</td>
          <td style='color:{{#compare global.hostsEvolution.cpu ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.hostsEvolution.cpu}}
              {{#compare global.hostsEvolution.cpu ">" 0}}+{{/compare}}
              {{global.hostsEvolution.cpu}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>RAM:</td>
          <td>{{global.hosts.ram}} GiB</td>
          <td style='color:{{#compare global.hostsEvolution.ram ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.hostsEvolution.ram}}
              {{#compare global.hostsEvolution.ram ">" 0}}+{{/compare}}
              {{global.hostsEvolution.ram}}%
            {{else}}
              0
            {{/if}}
          </td>
          </td>
        <tr>
        <tr>
          <td>Load average:</td>
          <td>{{global.hosts.load}} </td>
          <td style='color:{{#compare global.hostsEvolution.load ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.hostsEvolution.load}}
              {{#compare global.hostsEvolution.load ">" 0}}+{{/compare}}
              {{global.hostsEvolution.load}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Net reception:</td>
          <td>{{global.hosts.netReception}} KiB</td>
          <td style='color:{{#compare global.hostsEvolution.netReception ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.hostsEvolution.netReception}}
              {{#compare global.hostsEvolution.netReception ">" 0}}+{{/compare}}
              {{global.hostsEvolution.netReception}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
        <tr>
          <td>Net transmission:</td>
          <td>{{global.hosts.netTransmission}} KiB</td>
          <td style='color:{{#compare global.hostsEvolution.netTransmission ">" 0}} red {{else}} green {{/compare}}'>
            {{#if global.hostsEvolution.netTransmission}}
              {{#compare global.hostsEvolution.netTransmission ">" 0}}+{{/compare}}
              {{global.hostsEvolution.netTransmission}}%
            {{else}}
              0
            {{/if}}
          </td>
        <tr>
      </table>

      <div class="top">

        <table>
          <caption>3rd top usages</caption>
          <tr>
            <th></th>
            <th>UUID</th>
            <th>Name</th>
            <th>Value</th>
          </tr>
          <tr>
            <td rowspan='{{math topHosts.cpu.length "+" 1}}' class="tableHeader">CPU</td>
          </tr>
          {{#each topHosts.cpu}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} %</td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topHosts.ram.length "+" 1}}' class="tableHeader">RAM</td>
          </tr>
          {{#each topHosts.ram}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} GiB</td>
          </tr>
          {{/each}}
        </table>
        <table>
          <caption>3rd top usages</caption>
          <tr>
            <th></th>
            <th>UUID</th>
            <th>Name</th>
            <th>Value</th>
          </tr>
          <tr>
            <td rowspan='{{math topHosts.load.length "+" 1}}' class="tableHeader">Load average</td>
          </tr>
          {{#each topHosts.load}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} </td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topHosts.netReception.length "+" 1}}' class="tableHeader">Net reception</td>
          </tr>
          {{#each topHosts.netReception}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} KiB</td>
          </tr>
          {{/each}}
          <tr>
            <td rowspan='{{math topHosts.netTransmission.length "+" 1}}' class="tableHeader">Net transmission</td>
          </tr>
          {{#each topHosts.netTransmission}}
          <tr>
            <td>{{this.uuid}}</td>
            <td>{{this.name}}</td>
            <td>{{this.value}} KiB</td>
          </tr>
          {{/each}}
        </table>
      </div>
    </div>

    <div class="page">
      <div class="top">
        <table>
          <caption>3rd most allocated space </caption>
            <tr>
              <th>UUID</th>
              <th>Name</th>
              <th>value</th>
            </tr>
            {{#each topAllocation}}
              <tr>
                <td>{{this.uuid}}</td>
                <td>{{this.name}}</td>
                <td>{{this.size}} GiB</td>
              </tr>
             {{/each}}
          </table>
          <table>
             <caption>Hosts missing patches</caption>
            <tr>
            <th>UUID</th>
            <th>Name</th>
            <th>Patches</th>
            </tr>
              {{#if hostsMissingPatches}}
                {{#each hostsMissingPatches}}
                <tr>
                  <td>{{this.uuid}}</td>
                  <td>{{this.name}}</td>
                  <td>{{this.patches}}</td>
                </tr>
                {{/each}}
              {{else}}
                <tr>
                  <td colspan="2">All hosts are updated!</td>
                  <td>No patch!</td>
                </tr>
              {{/if}}
          </table>
          <table>
            <caption>Added Users</caption>
            <tr>
              <th>Email</th>
            </tr>
            {{#if usersEvolution.added}}
              {{#each usersEvolution.added}}
              <tr>
                <td>{{this}}</td>
              </tr>
              {{/each}}
            {{else}}
              <tr>
                <td>No added users!</td>
              </tr>
            {{/if}}
          </table>
          <table>
            <caption>Removed Users</caption>
            <tr>
              <th>Email</th>
            </tr>
            {{#if usersEvolution.removed}}
              {{#each usersEvolution.removed}}
              <tr>
                <td>{{this}}</td>
              </tr>
              {{/each}}
            {{else}}
              <tr>
                <td>No removed users!</td>
              </tr>
            {{/if}}
          </table>
          <table>
            <caption>Added Vms</caption>
            <tr>
              <th>UUID</th>
              <th>Name</th>
            </tr>
            {{#if vmsRessourcesEvolution.added}}
              {{#each vmsRessourcesEvolution.added}}
                <tr>
                  <td>{{this.uuid}}</td>
                  <td>{{this.name}}</td>
                </tr>
              {{/each}}
            {{else}}
              <tr>
                <td colspan="2">No added VMs!</td>
              </tr>
            {{/if}}
          </table>

          <table>
            <caption>Removed Vms</caption>
            <tr>
              <th>UUID</th>
              <th>Name</th>
            </tr>
            {{#if vmsRessourcesEvolution.removed}}
              {{#each vmsRessourcesEvolution.removed}}
              <tr>
                <td>{{this.uuid}}</td>
                <td>{{this.name}}</td>
              </tr>
              {{/each}}
            {{else}}
              <tr>
                <td colspan="2">No removed VMs!</td>
              </tr>
            {{/if}}
          </table>
          <table>
            <caption>Added Hosts</caption>
            <tr>
              <th>UUID</th>
              <th>Name</th>
            </tr>
            {{#if hostsRessourcesEvolution.added}}
              {{#each hostsRessourcesEvolution.added}}
              <tr>
                <td>{{this.uuid}}</td>
                <td>{{this.name}}</td>
              </tr>
              {{/each}}
            {{else}}
              <tr>
                <td colspan="2">No added Hosts!</td>
              </tr>
            {{/if}}
          </table>
          <table>
            <caption>Removed Hosts</caption>
            <tr>
              <th>UUID</th>
              <th>Name</th>
            </tr>
            {{#if hostsRessourcesEvolution.removed}}
              {{#each hostsRessourcesEvolution.removed}}
              <tr>
                <td>{{this.uuid}}</td>
                <td>{{this.name}}</td>
              </tr>
              {{/each}}
            {{else}}
              <tr>
                <td colspan="2">No removed Hosts!</td>
              </tr>
            {{/if}}
          </table>
      </div>
    </div>
</body>
</html>
